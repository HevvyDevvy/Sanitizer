/**
 * Sanitized — Core sanitizer engine
 * ----------------------------------
 * Configurable, profile-driven input & file validation.
 * Works standalone: drop this file into any project (Node or browser)
 * and call SanitizerCore.sanitizeText(...) / SanitizerCore.validateFile(...).
 *
 * No dependencies. No network calls. Pure functions.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SanitizerCore = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Character categories a profile can toggle on/off independently.
  // Each category is a self-contained group so users can carve out
  // exceptions (e.g. allow "-" and "_" for usernames) without touching
  // the rest of the ruleset.
  var DEFAULT_CATEGORIES = {
    angleBrackets:   { label: 'Angle brackets  < >',        chars: '<>',        enabled: true },
    brackets:        { label: 'Brackets  [ ] { } ( )',      chars: '[]{}()',    enabled: true },
    quotes:          { label: "Quotes  \" ' `",             chars: '"\'`',      enabled: true },
    slashes:         { label: 'Slashes  / \\',              chars: '/\\',       enabled: true },
    punctuation:     { label: 'Punctuation  : ; , .',       chars: ':;,.',      enabled: true },
    symbols:         { label: 'Symbols  # $ % & * + = @ ^ | ~ ! ?', chars: '#$%&*+=@^|~!?', enabled: true },
    dashUnderscore:  { label: 'Dash / Underscore  - _',     chars: '-_',        enabled: true }
  };

  var DEFAULT_PROFILE = {
    name: 'Default',
    description: 'No special characters. No number-only sequences. .png / .docx / .txt only.',
    charCategories: JSON.parse(JSON.stringify(DEFAULT_CATEGORIES)),
    customBannedChars: '',
    customAllowedChars: '',
    blockPureNumericStrings: true,
    blockNumericSequences: true,
    maxNumericSequenceLength: 3,
    allowedFileExtensions: ['.png', '.docx', '.txt'],
    caseSensitiveExtensions: false,
    maxFileSizeMB: 25
  };

  function cloneDefaultProfile(overrides) {
    var base = JSON.parse(JSON.stringify(DEFAULT_PROFILE));
    if (!overrides) return base;
    return deepMerge(base, overrides);
  }

  function deepMerge(target, source) {
    Object.keys(source || {}).forEach(function (key) {
      if (
        source[key] && typeof source[key] === 'object' && !Array.isArray(source[key]) &&
        target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])
      ) {
        deepMerge(target[key], source[key]);
      } else {
        target[key] = source[key];
      }
    });
    return target;
  }

  // Builds the effective banned-character Set for a profile:
  // union of enabled category chars + customBannedChars,
  // minus anything explicitly carved out via customAllowedChars.
  function getBannedCharSet(profile) {
    var banned = new Set();
    var categories = profile.charCategories || {};
    Object.keys(categories).forEach(function (key) {
      var cat = categories[key];
      if (cat && cat.enabled) {
        for (var i = 0; i < cat.chars.length; i++) banned.add(cat.chars[i]);
      }
    });
    (profile.customBannedChars || '').split('').forEach(function (c) { banned.add(c); });
    (profile.customAllowedChars || '').split('').forEach(function (c) { banned.delete(c); });
    return banned;
  }

  /**
   * Validate a text input string against a profile.
   * Returns { valid, reasons: string[], bannedFound: string[] }
   */
  function sanitizeText(input, profile) {
    profile = profile || DEFAULT_PROFILE;
    var reasons = [];
    var str = String(input == null ? '' : input);

    var bannedSet = getBannedCharSet(profile);
    var bannedFound = Array.from(new Set(str.split('').filter(function (c) { return bannedSet.has(c); })));
    if (bannedFound.length) {
      reasons.push('Disallowed characters found: ' + bannedFound.join(' '));
    }

    var trimmed = str.trim();
    if (profile.blockPureNumericStrings && trimmed.length > 0 && /^\d+$/.test(trimmed)) {
      reasons.push('Input cannot consist of numbers only');
    }

    if (profile.blockNumericSequences) {
      var maxLen = Math.max(0, profile.maxNumericSequenceLength || 0);
      var re = new RegExp('\\d{' + (maxLen + 1) + ',}');
      if (re.test(str)) {
        reasons.push('Numeric sequence longer than ' + maxLen + ' digits');
      }
    }

    return { valid: reasons.length === 0, reasons: reasons, bannedFound: bannedFound };
  }

  /**
   * Validate a file (by name + size) against a profile.
   * Returns { valid, reasons: string[] }
   */
  function validateFile(filename, sizeBytes, profile) {
    profile = profile || DEFAULT_PROFILE;
    var reasons = [];
    var name = String(filename || '');
    var dot = name.lastIndexOf('.');
    var ext = dot >= 0 ? name.slice(dot) : '';

    var allowed = (profile.allowedFileExtensions || []).slice();
    var check = ext;
    if (!profile.caseSensitiveExtensions) {
      allowed = allowed.map(function (e) { return e.toLowerCase(); });
      check = check.toLowerCase();
    }

    if (!allowed.includes(check)) {
      reasons.push('File type "' + (ext || '(none)') + '" not permitted. Allowed: ' + (profile.allowedFileExtensions || []).join(', '));
    }

    if (profile.maxFileSizeMB && typeof sizeBytes === 'number') {
      var maxBytes = profile.maxFileSizeMB * 1024 * 1024;
      if (sizeBytes > maxBytes) {
        reasons.push('File exceeds ' + profile.maxFileSizeMB + ' MB limit (' + (sizeBytes / (1024 * 1024)).toFixed(2) + ' MB)');
      }
    }

    return { valid: reasons.length === 0, reasons: reasons };
  }

  return {
    DEFAULT_CATEGORIES: DEFAULT_CATEGORIES,
    DEFAULT_PROFILE: DEFAULT_PROFILE,
    cloneDefaultProfile: cloneDefaultProfile,
    getBannedCharSet: getBannedCharSet,
    sanitizeText: sanitizeText,
    validateFile: validateFile
  };
});
