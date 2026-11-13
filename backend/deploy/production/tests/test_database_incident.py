import copy
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import Mock, patch

PROD = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROD))
import host
from database_plan import (
    SERVICES,
    migration_endpoint,
    validate_database_plan,
    validate_migration_owners,
)


class DatabaseIncidentTests(unittest.TestCase):
    def test_message_direct_migration_url_uses_the_declared_message_schema(self):
        values = {
            "DIRECT_URL_MESSAGE": "postgresql://u:p@db/db?schema=message",
            "DB_DDL_VERIFIED_MESSAGE": "true",
        }
        self.assertEqual(
            migration_endpoint(values, "message", migrating=True).query,
            "schema=message",
        )
        with self.assertRaisesRegex(ValueError, "wrong migration schema"):
            migration_endpoint(
                values
                | {
                    "DIRECT_URL_MESSAGE": "postgresql://u:p@db/db?schema=message_service"
                },
                "message",
                migrating=True,
            )

    def setUp(self):
        self.registry = json.loads((PROD / "services.json").read_text())["services"]
        self.values = {
            "DATABASE_URL": "postgresql://tenant:secret@pool.example/postgres",
            "DB_POOL_MAX": "1",
            "DB_POOL_LIMIT_PRIMARY": "16",
            "DB_POOL_RESERVE_PRIMARY": str(15 - len(SERVICES)),
        }
        for service in SERVICES:
            suffix = service.upper().replace("-", "_")
            self.values.update(
                {
                    f"DB_POOL_GROUP_{suffix}": "PRIMARY",
                    f"DB_POOL_REPLICAS_{suffix}": "1",
                    f"DIRECT_URL_{suffix}": "postgresql://ddl:secret@direct.example/postgres",
                    f"DB_DDL_VERIFIED_{suffix}": "true",
                }
            )

    def test_ten_services_fit_explicit_budget(self):
        self.assertEqual(
            validate_database_plan(self.values, self.registry)["PRIMARY"][
                "application_connections"
            ],
            10,
        )

    def test_old_default_and_rollout_overlap_exceed_session_pool(self):
        for update in ({"DB_POOL_MAX": "10"}, {"DB_POOL_REPLICAS_ORDER": "2"}):
            with self.subTest(update=update), self.assertRaisesRegex(
                ValueError, "exceeds limit"
            ):
                validate_database_plan(self.values | update, self.registry)

    def test_distinct_endpoints_have_independent_verified_budgets(self):
        values = self.values | {
            "DATABASE_URL_ORDER": "postgresql://other:secret@other.example/db",
            "DB_POOL_GROUP_ORDER": "OTHER",
            "DB_POOL_LIMIT_OTHER": "15",
            "DB_POOL_RESERVE_OTHER": "2",
        }
        self.assertEqual(
            set(validate_database_plan(values, self.registry)), {"PRIMARY", "OTHER"}
        )

    def test_identical_endpoint_cannot_escape_limit_by_group_rename(self):
        with self.assertRaisesRegex(ValueError, "cannot be split"):
            validate_database_plan(
                self.values | {"DB_POOL_GROUP_ORDER": "OTHER"}, self.registry
            )

    def test_invalid_missing_budget_and_ddl_values_fail_closed(self):
        for update in (
            {"DB_POOL_MAX": "0"},
            {"DB_POOL_MAX": "1.5"},
            {"DB_POOL_MAX": "01"},
            {"DB_POOL_TIMEOUT_MS": "0"},
            {"DB_POOL_REPLICAS_ORDER": "0"},
            {"DIRECT_URL_ORDER": "postgresql://u:p@db/db?schema=wallet_service"},
            {"DB_DDL_VERIFIED_ORDER": "false"},
            {"DB_POOL_GROUP_ORDER": ""},
        ):
            with self.subTest(keys=list(update)), self.assertRaises(ValueError):
                validate_database_plan(
                    self.values | update, self.registry, run_migrations=True
                )

    def test_all_optional_overrides_missing_empty_or_whitespace(self):
        for blank in (None, "", "   "):
            values = dict(self.values)
            for service in SERVICES:
                suffix = service.upper().replace("-", "_")
                for prefix in ("DIRECT_URL_", "DATABASE_URL_", "DB_POOL_MAX_"):
                    key = prefix + suffix
                    values.pop(key, None)
                    if blank is not None:
                        values[key] = blank
            values["DB_POOL_TIMEOUT_MS"] = values["DB_POOL_IDLE_MS"] = blank or ""
            with self.subTest(blank=blank):
                self.assertEqual(
                    validate_database_plan(values, self.registry, run_migrations=True)[
                        "PRIMARY"
                    ]["application_connections"],
                    10,
                )
                for service in SERVICES:
                    self.assertEqual(
                        migration_endpoint(values, service, migrating=True).hostname,
                        "pool.example",
                    )

    def test_ddl_confirmation_required_only_when_migrations_run(self):
        values = {
            key: val
            for key, val in self.values.items()
            if not key.startswith(("DIRECT_URL_", "DB_DDL_VERIFIED_"))
        }
        validate_database_plan(values, self.registry)
        with self.assertRaisesRegex(ValueError, "DB_DDL_VERIFIED_AUTH"):
            validate_database_plan(values, self.registry, run_migrations=True)

    def test_onboarding_requires_ddl_confirmation_only_for_message_related_migrations(
        self,
    ):
        values = dict(self.values)
        for service in SERVICES:
            suffix = service.upper().replace("-", "_")
            if service not in ("message", "notification", "order"):
                values.pop("DB_DDL_VERIFIED_" + suffix, None)
        validate_database_plan(
            values,
            self.registry,
            run_migrations=True,
            migration_scope={"message", "notification", "order"},
        )
        for service in ("message", "notification", "order"):
            key = "DB_DDL_VERIFIED_" + service.upper()
            invalid = dict(values)
            invalid.pop(key)
            with self.subTest(service=service), self.assertRaisesRegex(ValueError, key):
                validate_database_plan(
                    invalid,
                    self.registry,
                    run_migrations=True,
                    migration_scope={"message", "notification", "order"},
                )

    def test_onboarding_requires_ddl_confirmation_for_order(self):
        values = dict(self.values)
        values["DB_DDL_VERIFIED_ORDER"] = "false"
        with self.assertRaisesRegex(ValueError, "DB_DDL_VERIFIED_ORDER"):
            validate_database_plan(
                values,
                self.registry,
                run_migrations=True,
                migration_scope={"message", "notification", "order"},
            )
        values.pop("DB_DDL_VERIFIED_ORDER", None)
        with self.assertRaisesRegex(ValueError, "DB_DDL_VERIFIED_ORDER"):
            validate_database_plan(
                values,
                self.registry,
                run_migrations=True,
                migration_scope={"message", "notification", "order"},
            )
        values["DB_DDL_VERIFIED_ORDER"] = "true"
        plan = validate_database_plan(
            values,
            self.registry,
            run_migrations=True,
            migration_scope={"message", "notification", "order"},
        )
        self.assertIn("PRIMARY", plan)

    def test_supabase_poolers_follow_actual_consumer_requirements(self):
        values = {
            key: val
            for key, val in self.values.items()
            if not key.startswith("DIRECT_URL_")
        }
        for port in (5432, 6543):
            values["DATABASE_URL"] = (
                f"postgresql://postgres.tenant:secret@aws-0-region.pooler.supabase.com:{port}/postgres"
            )
            validate_database_plan(values, self.registry)  # runtime accepts both modes
            if port == 5432:
                validate_database_plan(values, self.registry, run_migrations=True)
            else:
                with self.assertRaisesRegex(ValueError, "transaction pooler"):
                    validate_database_plan(values, self.registry, run_migrations=True)
                for service in SERVICES:
                    values["DIRECT_URL_" + service.upper().replace("-", "_")] = (
                        "postgresql://ddl:secret@session.example/db"
                    )
                validate_database_plan(values, self.registry, run_migrations=True)

    def test_selected_override_is_used_and_invalid_nonempty_override_is_rejected(self):
        values = self.values | {
            "DIRECT_URL_AUTH": "postgresql://ddl:secret@chosen.example/db"
        }
        self.assertEqual(
            migration_endpoint(values, "auth", migrating=True).hostname,
            "chosen.example",
        )
        for key in ("DIRECT_URL_AUTH", "DATABASE_URL_AUTH", "DATABASE_URL"):
            for invalid in (
                "invalid",
                "https://example.com/db",
                "postgresql:///db",
                "postgresql://u:p@db:99999/db",
                "postgresql://u:p@db:0/db",
            ):
                with self.subTest(key=key, invalid=invalid), self.assertRaises(
                    ValueError
                ):
                    validate_database_plan(self.values | {key: invalid}, self.registry)

    def test_all_prisma_services_have_exactly_one_correct_owner_and_script(self):
        validate_migration_owners(PROD.parents[1], self.registry, host.MIGRATIONS)

    def test_missing_duplicate_and_wrong_host_owner_detected(self):
        for owner in ("order", "bidding", "matching", "tracking"):
            owners = copy.deepcopy(host.MIGRATIONS)
            owners["vps2"] = tuple(x for x in owners["vps2"] if x != owner)
            with self.subTest(owner=owner), self.assertRaisesRegex(
                ValueError, "exactly once"
            ):
                validate_migration_owners(PROD.parents[1], self.registry, owners)
        owners = copy.deepcopy(host.MIGRATIONS)
        owners["vps1"] += ("order",)
        with self.assertRaises(ValueError):
            validate_migration_owners(PROD.parents[1], self.registry, owners)
        owners["vps2"] = tuple(x for x in owners["vps2"] if x != "order")
        with self.assertRaisesRegex(ValueError, "host mismatch|execution owner order"):
            validate_migration_owners(PROD.parents[1], self.registry, owners)

    def test_each_vps2_migration_failure_blocks_all_service_starts(self):
        import tempfile

        for position, service in enumerate(host.MIGRATIONS["vps2"]):
            with self.subTest(
                service=service
            ), tempfile.TemporaryDirectory() as directory:
                obj = host.Host.__new__(host.Host)
                obj.role, obj.release_id, obj.bundle = (
                    "vps2",
                    "prod-20261103-41694703128-a1",
                    Path(directory),
                )
                obj.names = [name + "-service" for name in host.MIGRATIONS["vps2"]]
                obj.manifest = {"run_migrations": True, "migration_image": "fixture"}
                obj.owner = Mock(return_value={"previous": None})
                obj.compose, obj.verify = Mock(), Mock()
                with patch.object(host, "ROOT", Path(directory)), patch.object(
                    host,
                    "run",
                    side_effect=[None] * position + [RuntimeError("migration failed")],
                ) as run:
                    with self.assertRaisesRegex(RuntimeError, "migration failed"):
                        obj.apply(obj.release_id)
                self.assertFalse(
                    any(call.args[0] == "up" for call in obj.compose.call_args_list)
                )
                self.assertIn("HANDYGO_MIGRATION=1", run.call_args.args[0])
                obj.verify.assert_not_called()

    def test_restarted_healthy_container_remains_rejected_with_evidence(self):
        obj = host.Host.__new__(host.Host)
        obj.role, obj.release_id, obj.names = (
            "vps2",
            "prod-20261103-41694703128-a1",
            ["order-service"],
        )
        obj.compose = Mock(return_value="container-id")
        obj.manifest = {"app_image": "image", "created_at": "2026-11-03T01:00:00Z"}
        state = {
            "Running": True,
            "Health": {"Status": "healthy"},
            "OOMKilled": False,
            "StartedAt": "2026-11-03T01:02:00Z",
            "FinishedAt": "2026-11-03T01:01:59Z",
            "ExitCode": 0,
        }
        with patch.object(
            host, "run", side_effect=[json.dumps(state), "id", "id", "1"]
        ), patch.object(host, "emit") as emit:
            with self.assertRaisesRegex(RuntimeError, "has restarted"):
                obj.verify()
        evidence = json.loads(emit.call_args.args[1])
        self.assertEqual(evidence["restart_count"], 1)
        self.assertEqual(evidence["started_at"], state["StartedAt"])
        obj.compose.assert_called_once_with("ps", "-q", "order-service")

    def test_migration_inventory_detects_new_unowned_duplicate_missing_and_bad_config(
        self,
    ):
        import shutil
        import tempfile
        from database_plan import migration_inventory

        root_source = PROD.parents[1]
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            shutil.copy2(root_source / "package.json", root / "package.json")
            (root / "scripts").mkdir()
            shutil.copy2(
                root_source / "scripts/migration-url.ts",
                root / "scripts/migration-url.ts",
            )
            for parent in [
                p for p in ("apps", "foundations") if (root_source / p).is_dir()
            ]:
                for app in (root_source / parent).iterdir():
                    if not app.is_dir():
                        continue
                    destination = root / parent / app.name
                    for source in app.rglob("*"):
                        if not source.is_file():
                            continue
                        relative = source.relative_to(app)
                        if (
                            source.name == "schema.prisma"
                            or source.name.startswith("prisma.config.")
                            or source.name == "migration.sql"
                            or relative.parts[-2:] == ("prisma", "prisma.config.ts")
                        ):
                            target = destination / relative
                            target.parent.mkdir(parents=True, exist_ok=True)
                            shutil.copy2(source, target)
            registry = copy.deepcopy(self.registry)
            self.assertEqual(len(migration_inventory(root, registry)), 10)
            registry["api-gateway"]["migration"] = "api-gateway"
            with self.assertRaises(ValueError):
                migration_inventory(root, registry)
            duplicate = copy.deepcopy(self.registry)
            duplicate["payment-service"]["migration"] = "order"
            with self.assertRaisesRegex(ValueError, "Duplicate"):
                migration_inventory(root, duplicate)
            broken = copy.deepcopy(self.registry)
            broken["order-service"]["migration"] = None
            with self.assertRaises(ValueError):
                migration_inventory(root, broken)
            bad_script = json.loads((root / "package.json").read_text())
            bad_script["scripts"][
                "prisma:migrate:order"
            ] = "prisma migrate reset --schema=apps/order-service/prisma/schema.prisma --config=apps/order-service/prisma/prisma.config.ts"
            (root / "package.json").write_text(json.dumps(bad_script))
            with self.assertRaisesRegex(ValueError, "script missing or invalid"):
                migration_inventory(root, self.registry)
            bad_script["scripts"][
                "prisma:migrate:order"
            ] = "prisma migrate deploy --schema=apps/order-service/prisma/schema.prisma --config=apps/order-service/prisma/missing.config.ts"
            (root / "package.json").write_text(json.dumps(bad_script))
            with self.assertRaisesRegex(ValueError, "schema/config cannot be resolved"):
                migration_inventory(root, self.registry)
            bad_script["scripts"][
                "prisma:migrate:order"
            ] = "prisma migrate deploy --schema=apps/order-service/prisma/schema.prisma --config=apps/order-service/prisma/prisma.config.ts"
            (root / "package.json").write_text(json.dumps(bad_script))
            order_migrations = sorted(
                (root / "apps/order-service/prisma/migrations").glob("*/migration.sql")
            )
            self.assertTrue(
                order_migrations, "fixture must contain copied order migration SQL"
            )
            for migration in order_migrations:
                migration.unlink()
            with self.assertRaisesRegex(
                ValueError, "Migration SQL missing|outside configured execution path"
            ):
                migration_inventory(root, self.registry)


class OnboardingMigrationProofTests(unittest.TestCase):
    def test_exact_delta_and_unexecuted_sql_are_bound_to_baseline(self):
        import tempfile
        import shutil
        from database_plan import onboarding_migration_proof

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for source in PROD.parents[1].glob(
                "apps/*/prisma/migrations/**/migration.sql"
            ):
                destination = root / source.relative_to(PROD.parents[1])
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(source, destination)
            proof = onboarding_migration_proof(root, host.MIGRATIONS)
            self.assertEqual(proof["policy"], "vps4-additive-v2")
            self.assertEqual(
                proof["baseline_hash"],
                "74b963d47f03b9d80b069253585a10185849cea034b0b34218ebdaa0e7e84a45",
            )
            current = {
                "rollback_compatible": True,
                "onboard_vps4": True,
                "migration_scope": ["message", "notification", "order"],
                "migration_hash": proof["inventory_hash"],
                "migration_compatibility": proof,
            }
            previous = {
                "rollback_compatible": True,
                "migration_hash": proof["baseline_hash"],
            }
            self.assertTrue(host.rollback_migrations_compatible(current, previous))
            extra = (
                root
                / "apps/wallet-service/prisma/migrations/20990101000000_bad/migration.sql"
            )
            extra.parent.mkdir(parents=True)
            extra.write_text("DROP TABLE wallets;")
            changed = onboarding_migration_proof(root, host.MIGRATIONS)
            current.update(
                migration_hash=changed["inventory_hash"],
                migration_compatibility=changed,
            )
            self.assertFalse(host.rollback_migrations_compatible(current, previous))
            pinned = root / next(iter(host.ONBOARDING_ADDITIVE_SQL))
            pinned.write_text("DROP SCHEMA public CASCADE;")
            with self.assertRaisesRegex(ValueError, "reviewed additive"):
                onboarding_migration_proof(root, host.MIGRATIONS)
