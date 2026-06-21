/**
 * Advanced Sanitization Engine v2.1
 * Now supports dynamic rule configuration
 */
export function sanitizeLeadData(record, activeRules = {}) {
  try {
    if (!record || typeof record !== 'object') throw new Error("Null record");

    let processed = { ...record };
    let errors = [];

    // 1. Email Integrity (Always Required)
    const rawEmail = processed.email || '';
    const email = rawEmail.toLowerCase().trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) errors.push("Invalid Email Syntax");
    processed.email = email;

    // 2. Name Normalization (Toggleable)
    if (activeRules['R-01'] !== false) {
      const rawName = processed.name || '';
      const nameParts = rawName.trim().split(/\s+/);
      const toTitleCase = (str) => str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
      
      processed.firstName = nameParts.length > 0 ? toTitleCase(nameParts[0]) : '';
      processed.lastName = nameParts.length > 1 ? nameParts.slice(1).map(toTitleCase).join(' ') : '';
    }

    // 3. E.164 Formatting (Toggleable)
    if (activeRules['R-02'] !== false) {
      const numeric = (processed.phone || '').replace(/\D/g, '');
      if (numeric.length === 10) {
        processed.phone = `+1 (${numeric.slice(0,3)}) ${numeric.slice(3,6)}-${numeric.slice(6)}`;
      } else if (numeric.length === 11 && numeric.startsWith('1')) {
        processed.phone = `+1 (${numeric.slice(1,4)}) ${numeric.slice(4,7)}-${numeric.slice(7)}`;
      }
    }

    // 4. Entity Truncation (Toggleable)
    if (activeRules['R-03'] !== false && processed.company) {
      processed.company = processed.company
        .replace(/\b(LLC|Inc\.?|Corp\.?|Corporation)\b/gi, '')
        .replace(/,\s*$/, '')
        .trim();
    }

    return {
      ...processed,
      isValid: errors.length === 0 && !!processed.firstName,
      _error: errors.join(', '),
      _processed_at: new Date().toISOString()
    };
  } catch (e) {
    return { ...record, isValid: false, _error: e.message };
  }
}