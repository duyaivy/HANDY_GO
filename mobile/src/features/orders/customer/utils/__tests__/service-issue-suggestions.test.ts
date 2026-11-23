import { KNOWN_SERVICES_BY_ID } from '@/constants/services';
import {
  createQuickFillProvenance,
  EMPTY_DESCRIPTION_PROVENANCE,
  formatSuggestionSelection,
  GENERIC_FALLBACK_SUGGESTION_GROUPS,
  mergeDescriptionWithSuggestions,
  normalizeSuggestionGroups,
  normalizeVietnameseText,
  PLUMBING_SUGGESTION_GROUPS,
  reconcileDescriptionProvenanceOnEdit,
  resolveServiceSuggestions,
  startsWithSuggestionPrefix,
} from '../service-issue-suggestions';

describe('service-issue-suggestions utility (HG-95)', () => {
  describe('normalizeVietnameseText', () => {
    it('strips Vietnamese diacritics, normalizes đ/Đ, and collapses punctuation/whitespace', () => {
      expect(normalizeVietnameseText('Sửa Ống Nước & Bồn Cầu (Đà Nẵng)')).toBe(
        'sua ong nuoc bon cau da nang',
      );
      expect(normalizeVietnameseText(null)).toBe('');
      expect(normalizeVietnameseText(undefined)).toBe('');
    });
  });

  describe('normalizeSuggestionGroups', () => {
    it('returns null for null, undefined, non-array, or empty array', () => {
      expect(normalizeSuggestionGroups(null)).toBeNull();
      expect(normalizeSuggestionGroups(undefined)).toBeNull();
      expect(normalizeSuggestionGroups('invalid')).toBeNull();
      expect(normalizeSuggestionGroups({})).toBeNull();
      expect(normalizeSuggestionGroups([])).toBeNull();
    });

    it('sanitizes valid groups, deduplicates keys and options case-insensitively, and filters invalid groups', () => {
      const raw = [
        {
          key: ' Issue-Type ',
          label: ' Tình trạng máy ',
          descriptionPrefix: ' Tình trạng ',
          selectionMode: 'multiple',
          options: ['Không lạnh', '  không lạnh ', 'Chảy nước', '', '   ', 123],
        },
        {
          // Duplicate key after normalization -> should be skipped
          key: 'issue_type',
          label: 'Trùng key',
          options: ['Option A'],
        },
        {
          // Empty options -> should be skipped
          key: 'empty_opts',
          label: 'Không có option',
          options: ['   ', ''],
        },
        {
          key: 'severity',
          label: 'Mức độ',
          options: ['Bình thường', 'Khẩn cấp'],
        },
      ];

      const normalized = normalizeSuggestionGroups(raw);
      expect(normalized).toEqual([
        {
          key: 'issue_type',
          label: 'Tình trạng máy',
          descriptionPrefix: 'Tình trạng',
          selectionMode: 'multiple',
          options: ['Không lạnh', 'Chảy nước'],
        },
        {
          key: 'severity',
          label: 'Mức độ',
          selectionMode: 'single',
          options: ['Bình thường', 'Khẩn cấp'],
        },
      ]);
    });

    it('caps groups at 6 and options per group at 15', () => {
      const manyGroups = Array.from({ length: 9 }, (_, i) => ({
        key: `group_${i + 1}`,
        label: `Nhóm ${i + 1}`,
        options: Array.from({ length: 20 }, (__, j) => `Lựa chọn ${j + 1}`),
      }));

      const normalized = normalizeSuggestionGroups(manyGroups);
      expect(normalized).toHaveLength(6);
      expect(normalized?.[0].options).toHaveLength(15);
    });
  });

  describe('resolveServiceSuggestions (4-tier hierarchy)', () => {
    const customApiServiceGroups = [
      {
        key: 'custom_issue',
        label: 'Sự cố riêng từ API Service',
        descriptionPrefix: 'Sự cố API',
        options: ['Lỗi bo mạch inverter', 'Hỏng cảm biến nhiệt'],
      },
    ];

    const customApiCategoryGroups = [
      {
        key: 'cat_issue',
        label: 'Gợi ý chung từ API Category',
        descriptionPrefix: 'Nhóm lỗi',
        options: ['Bảo trì định kỳ', 'Sửa chữa tận nơi'],
      },
    ];

    it('tier 1: prioritizes valid serviceSuggestionGroups from API over category and local presets', () => {
      const result = resolveServiceSuggestions({
        serviceId: '34ec7df5-20db-401e-804a-6feee5b48184',
        serviceName: 'Sửa máy lạnh',
        categoryName: 'Điện lạnh',
        serviceSuggestionGroups: customApiServiceGroups,
        categorySuggestionGroups: customApiCategoryGroups,
      });

      expect(result.source).toBe('api-service');
      expect(result.groups[0].label).toBe('Sự cố riêng từ API Service');
    });

    it('tier 2: falls back to categorySuggestionGroups from API when serviceSuggestionGroups is null or empty', () => {
      const result = resolveServiceSuggestions({
        serviceId: '34ec7df5-20db-401e-804a-6feee5b48184',
        serviceName: 'Sửa máy lạnh',
        categoryName: 'Điện lạnh',
        serviceSuggestionGroups: null,
        categorySuggestionGroups: customApiCategoryGroups,
      });

      expect(result.source).toBe('api-category');
      expect(result.groups[0].label).toBe('Gợi ý chung từ API Category');
    });

    it('tier 3: resolves exact Jira mockup groups and options for Sửa ống nước', () => {
      const result = resolveServiceSuggestions({
        serviceId: 'b1026b8e-dd6c-478b-aeab-1afb582bcfd0',
        serviceName: 'Sửa ống nước',
      });

      expect(result.source).toBe('local-service');
      expect(result.presetKey).toBe('plumbing_water');
      expect(result.groups).toEqual(PLUMBING_SUGGESTION_GROUPS);
    });

    it('tier 3: resolves domain-specific presets for every known service in KNOWN_SERVICES_BY_ID without falling through to generic fallback', () => {
      for (const [serviceId, serviceName] of Object.entries(KNOWN_SERVICES_BY_ID)) {
        const resolved = resolveServiceSuggestions({ serviceId, serviceName });
        expect(['local-service', 'local-category']).toContain(resolved.source);
        expect(resolved.groups.length).toBeGreaterThanOrEqual(2);
      }
    });

    it('tier 3: resolves category preset by categoryName when serviceName is a new service in an existing category', () => {
      const result = resolveServiceSuggestions({
        serviceId: 'new-uuid-1234',
        serviceName: 'Lắp đặt quạt trần trang trí thông minh',
        categoryName: 'Điện dân dụng & Chiếu sáng',
      });

      expect(result.source).toBe('local-category');
      expect(result.presetKey).toBe('cat_electrical');
    });

    it('tier 4: falls back to neutral GENERIC_FALLBACK_SUGGESTION_GROUPS for completely unknown service and category', () => {
      const result = resolveServiceSuggestions({
        serviceId: '99999999-8888-7777-6666-555555555555',
        serviceName: 'Chăm sóc thú cưng spa tại nhà',
        categoryName: 'Thú cưng',
      });

      expect(result.source).toBe('fallback');
      expect(result.presetKey).toBe('generic_fallback');
      expect(result.groups).toEqual(GENERIC_FALLBACK_SUGGESTION_GROUPS);
    });
  });

  describe('formatSuggestionSelection & mergeDescriptionWithSuggestions', () => {
    const groups = [
      {
        key: 'issue',
        label: 'Tình trạng máy giặt',
        descriptionPrefix: 'Tình trạng',
        selectionMode: 'multiple' as const,
        options: ['Không vắt / không quay lồng', 'Kêu to và rung lắc mạnh', 'Chưa rõ'],
      },
      {
        key: 'device_type',
        label: 'Loại máy giặt',
        descriptionPrefix: 'Loại máy',
        selectionMode: 'single' as const,
        options: ['Cửa ngang (Lồng ngang)', 'Cửa trên (Lồng đứng)', 'Chưa rõ'],
      },
    ];

    it('formats single and multiple selections while ignoring "Chưa rõ"', () => {
      const formatted = formatSuggestionSelection(groups, {
        issue: ['Không vắt / không quay lồng', 'Kêu to và rung lắc mạnh', 'Chưa rõ'],
        device_type: ['Cửa ngang (Lồng ngang)'],
      });

      expect(formatted).toBe(
        'Tình trạng: Không vắt / không quay lồng, Kêu to và rung lắc mạnh - Loại máy: Cửa ngang (Lồng ngang)',
      );

      const onlyUnknown = formatSuggestionSelection(groups, {
        issue: ['Chưa rõ'],
        device_type: ['Chưa rõ'],
      });
      expect(onlyUnknown).toBe('');
    });

    it('prefixes serviceName when no custom text exists and clears back to empty when all chips are unselected', () => {
      const chip1 = 'Tình trạng: Không vắt / không quay lồng';
      const step1 = mergeDescriptionWithSuggestions({
        currentDescription: '',
        previousProvenance: EMPTY_DESCRIPTION_PROVENANCE,
        nextChipText: chip1,
        serviceName: 'Sửa máy giặt',
      });
      expect(step1.description).toBe('Tôi cần người Sửa máy giặt: Tình trạng: Không vắt / không quay lồng');
      expect(step1.provenance.segment).toEqual({
        start: 0,
        end: step1.description.length,
        text: step1.description,
      });
      expect(step1.description).not.toContain('Cần thợ kiểm tra');

      const chip2 = 'Tình trạng: Không vắt / không quay lồng - Loại máy: Cửa ngang (Lồng ngang)';
      const step2 = mergeDescriptionWithSuggestions({
        currentDescription: step1.description,
        previousProvenance: step1.provenance,
        nextChipText: chip2,
        serviceName: 'Sửa máy giặt',
      });
      expect(step2.description).toBe(
        'Tôi cần người Sửa máy giặt: Tình trạng: Không vắt / không quay lồng - Loại máy: Cửa ngang (Lồng ngang)',
      );

      const step3 = mergeDescriptionWithSuggestions({
        currentDescription: step2.description,
        previousProvenance: step2.provenance,
        nextChipText: '',
        serviceName: 'Sửa máy giặt',
      });
      expect(step3.description).toBe('');
      expect(step3.provenance).toEqual(EMPTY_DESCRIPTION_PROVENANCE);
    });

    it('preserves 100% of user custom typed text across selecting, updating, and clearing dynamic chips', () => {
      const customText = 'Máy giặt Electrolux để ở ban công tầng 3 bị kẹt cửa';
      const chip1 = 'Tình trạng: Không vắt / không quay lồng';

      const step1 = mergeDescriptionWithSuggestions({
        currentDescription: customText,
        previousProvenance: EMPTY_DESCRIPTION_PROVENANCE,
        nextChipText: chip1,
        serviceName: 'Sửa máy giặt',
      });
      expect(step1.description).toBe(`${customText}. ${chip1}`);

      const chip2 = 'Tình trạng: Không vắt / không quay lồng - Loại máy: Cửa ngang (Lồng ngang)';
      const step2 = mergeDescriptionWithSuggestions({
        currentDescription: step1.description,
        previousProvenance: step1.provenance,
        nextChipText: chip2,
        serviceName: 'Sửa máy giặt',
      });
      expect(step2.description).toBe(`${customText}. ${chip2}`);

      const step3 = mergeDescriptionWithSuggestions({
        currentDescription: step2.description,
        previousProvenance: step2.provenance,
        nextChipText: '',
        serviceName: 'Sửa máy giặt',
      });
      expect(step3.description).toBe(customText);
    });

    it.each([
      'Sự cố: máy giặt bị chập điện mỗi tối',
      'Vị trí: tầng 2',
      'Tình trạng: kêu to. Cần thợ kiểm tra và xử lý sớm.',
      'Máy giặt kêu to.',
      'Tôi cần người Sửa máy giặt',
    ])('never deletes user-typed text that looks like a suggestion prefix or quick-fill: %s', (userText) => {
      const chipA = 'Tình trạng: Kêu to và rung lắc mạnh';
      const chipB = 'Tình trạng: Kêu to và rung lắc mạnh - Loại máy: Cửa trên (Lồng đứng)';

      const select = mergeDescriptionWithSuggestions({
        currentDescription: userText,
        previousProvenance: EMPTY_DESCRIPTION_PROVENANCE,
        nextChipText: chipA,
        serviceName: 'Sửa máy giặt',
      });
      expect(select.description.startsWith(userText)).toBe(true);
      expect(select.description.endsWith(chipA)).toBe(true);

      const change = mergeDescriptionWithSuggestions({
        currentDescription: select.description,
        previousProvenance: select.provenance,
        nextChipText: chipB,
        serviceName: 'Sửa máy giặt',
      });
      expect(change.description.startsWith(userText)).toBe(true);
      expect(change.description.endsWith(chipB)).toBe(true);
      expect(change.description).not.toContain(`${chipA}.`);

      const unselect = mergeDescriptionWithSuggestions({
        currentDescription: change.description,
        previousProvenance: change.provenance,
        nextChipText: '',
        serviceName: 'Sửa máy giặt',
      });
      expect(unselect.description).toBe(userText);
    });

    it('merges quick-fill provenance with ": " and restores quick-fill text when chips are cleared, unless edited by user', () => {
      const quickFill = 'Tôi cần người Sửa máy giặt';
      const quickProv = createQuickFillProvenance();

      // Selecting a chip right after pressing quick-fill formats with ": "
      const step1 = mergeDescriptionWithSuggestions({
        currentDescription: quickFill,
        previousProvenance: quickProv,
        nextChipText: 'Tình trạng: Kêu to và rung lắc mạnh',
        serviceName: 'Sửa máy giặt',
      });
      expect(step1.description).toBe('Tôi cần người Sửa máy giặt: Tình trạng: Kêu to và rung lắc mạnh');
      expect(step1.provenance.isQuickFillBase).toBe(true);

      // Unselecting chips returns to the quick-fill base that user explicitly tapped
      const step2 = mergeDescriptionWithSuggestions({
        currentDescription: step1.description,
        previousProvenance: step1.provenance,
        nextChipText: '',
        serviceName: 'Sửa máy giặt',
      });
      expect(step2.description).toBe(quickFill);
      expect(step2.provenance.isQuickFillBase).toBe(true);

      // If user manually edits after quick-fill, provenance becomes user-owned
      const edited = `${quickFill} ở tầng 2`;
      const editedProv = reconcileDescriptionProvenanceOnEdit(quickFill, edited, step2.provenance);
      expect(editedProv.isQuickFillBase).toBe(false);

      const step3 = mergeDescriptionWithSuggestions({
        currentDescription: edited,
        previousProvenance: editedProv,
        nextChipText: 'Loại máy: Cửa ngang (Lồng ngang)',
        serviceName: 'Sửa máy giặt',
      });
      expect(step3.description).toBe(`${edited}. Loại máy: Cửa ngang (Lồng ngang)`);

      const step4 = mergeDescriptionWithSuggestions({
        currentDescription: step3.description,
        previousProvenance: step3.provenance,
        nextChipText: '',
        serviceName: 'Sửa máy giặt',
      });
      expect(step4.description).toBe(edited);
    });

    it('does not delete user text that matches a chip when user manually deletes the generated suffix and selects another chip', () => {
      const userText = 'Máy giặt. Tình trạng: Kêu to';
      const step1 = mergeDescriptionWithSuggestions({
        currentDescription: userText,
        previousProvenance: EMPTY_DESCRIPTION_PROVENANCE,
        nextChipText: 'Tình trạng: Kêu to',
        serviceName: 'Sửa máy giặt',
      });
      expect(step1.description).toBe('Máy giặt. Tình trạng: Kêu to. Tình trạng: Kêu to');

      // Case A: user selects and deletes the entire generated suffix at once
      const provAfterBulkDelete = reconcileDescriptionProvenanceOnEdit(
        step1.description,
        userText,
        step1.provenance,
      );
      expect(provAfterBulkDelete.segment).toBeNull();

      const step2Bulk = mergeDescriptionWithSuggestions({
        currentDescription: userText,
        previousProvenance: provAfterBulkDelete,
        nextChipText: 'Tình trạng: Không quay',
        serviceName: 'Sửa máy giặt',
      });
      expect(step2Bulk.description).toBe('Máy giặt. Tình trạng: Kêu to. Tình trạng: Không quay');

      // Case B: user backspaces the generated suffix character by character
      let curText = step1.description;
      let curProv = step1.provenance;
      while (curText.length > userText.length) {
        const next = curText.slice(0, -1);
        curProv = reconcileDescriptionProvenanceOnEdit(curText, next, curProv);
        curText = next;
      }
      expect(curText).toBe(userText);
      expect(curProv.segment).toBeNull();

      const step2CharByChar = mergeDescriptionWithSuggestions({
        currentDescription: curText,
        previousProvenance: curProv,
        nextChipText: 'Tình trạng: Không quay',
        serviceName: 'Sửa máy giặt',
      });
      expect(step2CharByChar.description).toBe('Máy giặt. Tình trạng: Kêu to. Tình trạng: Không quay');
    });

    it('preserves user edits made in the middle of a generated segment when changing or clearing chips', () => {
      const step1 = mergeDescriptionWithSuggestions({
        currentDescription: 'Máy giặt hỏng',
        previousProvenance: EMPTY_DESCRIPTION_PROVENANCE,
        nextChipText: 'Tình trạng: Kêu to',
        serviceName: 'Sửa máy giặt',
      });
      expect(step1.description).toBe('Máy giặt hỏng. Tình trạng: Kêu to');

      // User edits inside the generated segment ("Kêu to" -> "Kêu rất to")
      const edited = 'Máy giặt hỏng. Tình trạng: Kêu rất to';
      const provAfterMiddleEdit = reconcileDescriptionProvenanceOnEdit(
        step1.description,
        edited,
        step1.provenance,
      );
      expect(provAfterMiddleEdit.segment).toBeNull();

      const step2 = mergeDescriptionWithSuggestions({
        currentDescription: edited,
        previousProvenance: provAfterMiddleEdit,
        nextChipText: 'Tình trạng: Không quay',
        serviceName: 'Sửa máy giặt',
      });
      expect(step2.description).toBe('Máy giặt hỏng. Tình trạng: Kêu rất to. Tình trạng: Không quay');

      const step3 = mergeDescriptionWithSuggestions({
        currentDescription: step2.description,
        previousProvenance: step2.provenance,
        nextChipText: '',
        serviceName: 'Sửa máy giặt',
      });
      expect(step3.description).toBe(edited);
    });

    it('shifts tracked generated range when user edits strictly before it, and keeps text appended strictly after it', () => {
      const step1 = mergeDescriptionWithSuggestions({
        currentDescription: 'Máy giặt hỏng',
        previousProvenance: EMPTY_DESCRIPTION_PROVENANCE,
        nextChipText: 'Loại máy: Cửa ngang (Lồng ngang)',
        serviceName: 'Sửa máy giặt',
      });

      // Edit strictly before generated segment
      const editedBefore = 'Máy giặt LG hỏng. Loại máy: Cửa ngang (Lồng ngang)';
      const provBefore = reconcileDescriptionProvenanceOnEdit(
        step1.description,
        editedBefore,
        step1.provenance,
      );
      expect(provBefore.segment).toEqual({
        start: 16,
        end: editedBefore.length,
        text: '. Loại máy: Cửa ngang (Lồng ngang)',
      });

      // Edit strictly after generated segment
      const editedAfter = `${editedBefore}, đã dùng 5 năm`;
      const provAfter = reconcileDescriptionProvenanceOnEdit(
        editedBefore,
        editedAfter,
        provBefore,
      );
      expect(provAfter.segment).toEqual(provBefore.segment);

      const cleared = mergeDescriptionWithSuggestions({
        currentDescription: editedAfter,
        previousProvenance: provAfter,
        nextChipText: '',
        serviceName: 'Sửa máy giặt',
      });
      expect(cleared.description).toBe('Máy giặt LG hỏng, đã dùng 5 năm');
    });
  });

  describe('startsWithSuggestionPrefix', () => {
    it('detects dynamic suggestion prefixes without matching full sentences or existing "Tôi cần người" prefix', () => {
      expect(startsWithSuggestionPrefix('Sự cố: Rò rỉ nước')).toBe(true);
      expect(startsWithSuggestionPrefix('Vị trí: Nhà tắm')).toBe(true);
      expect(startsWithSuggestionPrefix('Tình trạng: Không lạnh / yếu lạnh')).toBe(true);
      expect(startsWithSuggestionPrefix('Nhu cầu: Vệ sinh định kỳ')).toBe(true);
      expect(startsWithSuggestionPrefix('Tôi cần người Sửa máy lạnh: Tình trạng: Không lạnh')).toBe(false);
      expect(startsWithSuggestionPrefix('Máy lạnh phòng khách chạy kêu to')).toBe(false);
    });
  });
});
