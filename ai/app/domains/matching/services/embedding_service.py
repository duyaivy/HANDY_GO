from __future__ import annotations

import asyncio
from collections import OrderedDict
import hashlib
import logging
import threading
import time
from typing import Sequence

import numpy as np
from sentence_transformers import SentenceTransformer

from app.domains.matching.core.config import matching_settings

logger = logging.getLogger("matching.embedding_service")


class MultilingualE5Service:
    """
    Singleton service managing Sentence Transformers inference for intfloat/multilingual-e5-small.
    Implements:
    - Lazy / Startup singleton initialization (loads model once per process)
    - E5 prefix compliance (query: vs passage:)
    - Text validation, Vietnamese diacritics preservation & safe truncation
    - Bounded LRU in-memory embedding cache for worker descriptions
    - Batched encoding
    - Asynchronous concurrency control via asyncio.Semaphore
    """

    _instance: MultilingualE5Service | None = None
    _lock = threading.Lock()

    def __init__(self) -> None:
        self.model_name = matching_settings.model_name
        self.device = matching_settings.device
        self._model: SentenceTransformer | None = None
        self._is_loading = False
        self._load_error: str | None = None
        self._embedding_dim = 384

        # LRU cache for worker passage embeddings
        self._cache_lock = threading.Lock()
        self._cache: OrderedDict[str, np.ndarray] = OrderedDict()
        self._cache_capacity = matching_settings.embedding_cache_size

        # Concurrency semaphore (initialized on first async call)
        self._semaphore: asyncio.Semaphore | None = None

    @classmethod
    def get_instance(cls) -> MultilingualE5Service:
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    @property
    def is_ready(self) -> bool:
        return self._model is not None and self._load_error is None

    @property
    def embedding_dimension(self) -> int:
        return self._embedding_dim

    @property
    def cache_size(self) -> int:
        with self._cache_lock:
            return len(self._cache)

    def load_model(self) -> None:
        """
        Synchronously loads the model weights if not already loaded.
        """
        if self._model is not None:
            return

        with self._lock:
            if self._model is not None:
                return
            self._is_loading = True
            logger.info("Loading embedding model %s on device %s...", self.model_name, self.device)
            start = time.perf_counter()
            try:
                self._model = SentenceTransformer(
                    self.model_name,
                    device=self.device,
                    cache_folder=matching_settings.model_cache_dir,
                )
                dim_getter = getattr(self._model, "get_embedding_dimension", None) or getattr(self._model, "get_sentence_embedding_dimension", lambda: 384)
                self._embedding_dim = dim_getter() or 384
                self._load_error = None
                duration = time.perf_counter() - start
                logger.info(
                    "Model %s loaded successfully in %.2fs (dim=%d)",
                    self.model_name,
                    duration,
                    self._embedding_dim,
                )
            except Exception as e:
                self._load_error = str(e)
                logger.exception("Failed to load embedding model %s: %s", self.model_name, e)
                raise
            finally:
                self._is_loading = False

    def clean_and_normalize_text(self, text: str | None, max_chars: int = 2000) -> str:
        """
        Cleans input text by stripping control characters and collapsing whitespace
        while strictly preserving Vietnamese diacritics and letters.
        """
        if not text:
            return ""
        # Strip control characters except newline/tab
        cleaned = "".join(ch for ch in text if ch.isprintable() or ch in ("\n", "\t"))
        # Collapse excessive whitespace
        cleaned = " ".join(cleaned.split())
        # Safe truncation
        if len(cleaned) > max_chars:
            cleaned = cleaned[:max_chars].rsplit(" ", 1)[0]
        return cleaned

    def _format_query(self, text: str) -> str:
        clean = self.clean_and_normalize_text(text, matching_settings.max_text_chars)
        if clean.startswith("query:"):
            return clean
        return f"query: {clean}" if clean else "query: "

    def _format_passage(self, text: str) -> str:
        clean = self.clean_and_normalize_text(text, matching_settings.max_text_chars)
        if clean.startswith("passage:"):
            return clean
        return f"passage: {clean}" if clean else "passage: "

    def _get_cache_key(self, passage_text: str) -> str:
        content = f"{self.model_name}:{passage_text}"
        return hashlib.sha256(content.encode("utf-8")).hexdigest()

    def _get_from_cache(self, key: str) -> np.ndarray | None:
        with self._cache_lock:
            if key in self._cache:
                self._cache.move_to_end(key)
                return self._cache[key]
            return None

    def _put_to_cache(self, key: str, embedding: np.ndarray) -> None:
        with self._cache_lock:
            if key in self._cache:
                self._cache.move_to_end(key)
            else:
                if len(self._cache) >= self._cache_capacity:
                    self._cache.popitem(last=False)
                self._cache[key] = embedding

    def _get_semaphore(self) -> asyncio.Semaphore:
        if self._semaphore is None:
            self._semaphore = asyncio.Semaphore(matching_settings.max_concurrent_inferences)
        return self._semaphore

    async def encode_query(self, query_text: str) -> np.ndarray:
        """
        Asynchronously encodes a single customer query text with 'query:' prefix.
        Returns a 1D normalized numpy array.
        """
        if not self.is_ready:
            self.load_model()

        formatted_query = self._format_query(query_text)
        sem = self._get_semaphore()

        async with sem:
            loop = asyncio.get_running_loop()
            embedding = await loop.run_in_executor(
                None,
                lambda: self._model.encode(
                    formatted_query,
                    normalize_embeddings=True,
                    show_progress_bar=False,
                ),
            )
            return np.asarray(embedding, dtype=np.float32)

    async def encode_passages(self, passage_texts: Sequence[str]) -> list[np.ndarray]:
        """
        Asynchronously encodes worker descriptions with 'passage:' prefix using
        LRU cache and batched inference.
        """
        if not self.is_ready:
            self.load_model()

        if not passage_texts:
            return []

        formatted_passages = [self._format_passage(t) for t in passage_texts]
        keys = [self._get_cache_key(p) for p in formatted_passages]

        results: list[np.ndarray | None] = [self._get_from_cache(k) for k in keys]
        missing_indices: list[int] = [i for i, r in enumerate(results) if r is None]

        if missing_indices:
            missing_texts = [formatted_passages[i] for i in missing_indices]
            sem = self._get_semaphore()

            async with sem:
                loop = asyncio.get_running_loop()
                batch_size = matching_settings.candidate_batch_size

                def _encode_batches():
                    return self._model.encode(
                        missing_texts,
                        batch_size=batch_size,
                        normalize_embeddings=True,
                        show_progress_bar=False,
                    )

                new_embeddings = await loop.run_in_executor(None, _encode_batches)

            for idx, emb in zip(missing_indices, new_embeddings):
                emb_arr = np.asarray(emb, dtype=np.float32)
                results[idx] = emb_arr
                self._put_to_cache(keys[idx], emb_arr)

        return [r for r in results if r is not None]

    async def compute_semantic_scores(
        self,
        query_text: str,
        candidate_descriptions: Sequence[str],
    ) -> list[float]:
        """
        Computes cosine similarities between query and all candidate passages,
        returning normalized scores in [0.0, 100.0].
        When calibration is enabled, linearly maps the practical E5 semantic band
        [C_min, C_max] to [0.0, 100.0] so semantic differences adequately impact
        the composite ranking score.
        """
        if not candidate_descriptions:
            return []

        query_emb = await self.encode_query(query_text)
        passage_embs = await self.encode_passages(candidate_descriptions)

        # Compute dot product (since embeddings are L2 normalized, dot product == cosine similarity)
        matrix = np.stack(passage_embs, axis=0)  # Shape: (N, D)
        similarities = np.dot(matrix, query_emb)  # Shape: (N,)

        scores: list[float] = []
        c_min = matching_settings.semantic_calib_min
        c_max = matching_settings.semantic_calib_max
        use_calib = matching_settings.enable_semantic_calibration

        for cos_sim in similarities:
            val = float(cos_sim)
            if use_calib:
                if c_max > c_min:
                    score_val = max(0.0, min(100.0, ((val - c_min) / (c_max - c_min)) * 100.0))
                else:
                    score_val = max(0.0, min(100.0, val * 100.0))
            else:
                score_val = max(0.0, min(1.0, val)) * 100.0

            scores.append(round(score_val, 2))

        return scores
