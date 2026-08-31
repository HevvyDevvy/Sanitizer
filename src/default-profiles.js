const { cloneDefaultProfile } = require('./sanitizer-core');

/**
 * The profiles a fresh install ships with. Users can edit, duplicate,
 * rename or delete every one of these — nothing here is hardcoded
 * into the engine itself, it's just a starting point.
 */
function buildDefaultProfiles() {
  const strict = cloneDefaultProfile({
    name: 'Default (Strict)',
    description: 'No special characters. No number-only sequences. .png / .docx / .txt only.'
  });

  const contact = cloneDefaultProfile({
    name: 'Contact Field',
    description: 'For email / URL style fields — allows @ . - while still blocking script and query payload characters.',
    customAllowedChars: '@.-',
  });
  contact.charCategories.dashUnderscore.enabled = false;

  const fileUploadOnly = cloneDefaultProfile({
    name: 'File Upload Only',
    description: 'No text rules applied — just file extension and size limits.',
    allowedFileExtensions: ['.png', '.jpg', '.jpeg', '.docx', '.pdf', '.txt'],
    maxFileSizeMB: 50
  });
  Object.keys(fileUploadOnly.charCategories).forEach((k) => {
    fileUploadOnly.charCategories[k].enabled = false;
  });
  fileUploadOnly.blockPureNumericStrings = false;
  fileUploadOnly.blockNumericSequences = false;

  return [strict, contact, fileUploadOnly];
}

module.exports = { buildDefaultProfiles };
