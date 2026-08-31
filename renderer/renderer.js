(function () {
  'use strict';

  // sanitizer-core is loaded standalone in the renderer too (no Node here),
  // so we inline the same pure logic via a small local copy of the two
  // functions we need for live-test feedback. The authoritative engine
  // used by the scanner/export lives in src/sanitizer-core.js.
  var Core = window.SanitizerCore;

  var state = {
    profiles: [],
    activeIndex: 0,
    dirty: false,
    lastScanResults: [],
    scanFolder: null
  };

  var CATEGORY_ORDER = [
    'angleBrackets', 'brackets', 'quotes', 'slashes',
    'punctuation', 'symbols', 'dashUnderscore'
  ];

  // ---------- boot ----------

  async function boot() {
    state.profiles = await window.api.loadProfiles();
    if (!state.profiles || !state.profiles.length) {
      state.profiles = [Core.cloneDefaultProfile()];
    }
    renderProfileList();
    selectProfile(0);
    renderProfileSelects();
    wireNav();
    wireRulesForm();
    wireLiveTest();
    wireScanner();
    wireExport();
  }

  // ---------- navigation ----------

  function wireNav() {
    document.querySelectorAll('.nav-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.nav-btn').forEach(function (b) { b.classList.remove('active'); });
        document.querySelectorAll('.view').forEach(function (v) { v.classList.remove('active'); });
        btn.classList.add('active');
        document.getElementById('view-' + btn.dataset.view).classList.add('active');
      });
    });
  }

  // ---------- profile list / CRUD ----------

  function renderProfileList() {
    var list = document.getElementById('profileList');
    list.innerHTML = '';
    state.profiles.forEach(function (p, i) {
      var el = document.createElement('div');
      el.className = 'profile-item' + (i === state.activeIndex ? ' active' : '');
      el.textContent = p.name || 'Untitled profile';
      el.addEventListener('click', function () { selectProfile(i); });
      list.appendChild(el);
    });
  }

  function renderProfileSelects() {
    ['testProfileSelect', 'scanProfileSelect'].forEach(function (id) {
      var sel = document.getElementById(id);
      var prev = sel.value;
      sel.innerHTML = '';
      state.profiles.forEach(function (p) {
        var opt = document.createElement('option');
        opt.value = p.name;
        opt.textContent = p.name;
        sel.appendChild(opt);
      });
      if (prev && state.profiles.some(function (p) { return p.name === prev; })) sel.value = prev;
    });
  }

  function selectProfile(i) {
    state.activeIndex = i;
    renderProfileList();
    fillRulesForm(state.profiles[i]);
  }

  function activeProfile() { return state.profiles[state.activeIndex]; }

  document.addEventListener('DOMContentLoaded', function () {
    document.getElementById('newProfileBtn').addEventListener('click', function () {
      var p = Core.cloneDefaultProfile({ name: 'New profile ' + (state.profiles.length + 1) });
      state.profiles.push(p);
      selectProfile(state.profiles.length - 1);
      renderProfileSelects();
      markDirty();
    });

    document.getElementById('duplicateProfileBtn').addEventListener('click', function () {
      var src = activeProfile();
      var copy = JSON.parse(JSON.stringify(src));
      copy.name = src.name + ' copy';
      state.profiles.push(copy);
      selectProfile(state.profiles.length - 1);
      renderProfileSelects();
      markDirty();
    });

    document.getElementById('deleteProfileBtn').addEventListener('click', function () {
      if (state.profiles.length <= 1) return;
      if (!confirm('Delete profile "' + activeProfile().name + '"? This cannot be undone.')) return;
      state.profiles.splice(state.activeIndex, 1);
      selectProfile(Math.max(0, state.activeIndex - 1));
      renderProfileSelects();
      markDirty();
    });
  });

  // ---------- rules form ----------

  function fillRulesForm(profile) {
    document.getElementById('profileName').value = profile.name || '';
    document.getElementById('profileDesc').value = profile.description || '';
    document.getElementById('customBanned').value = profile.customBannedChars || '';
    document.getElementById('customAllowed').value = profile.customAllowedChars || '';
    document.getElementById('blockPureNumeric').checked = !!profile.blockPureNumericStrings;
    document.getElementById('blockNumericSeq').checked = !!profile.blockNumericSequences;
    document.getElementById('maxNumericLen').value = profile.maxNumericSequenceLength || 0;
    document.getElementById('maxFileSize').value = profile.maxFileSizeMB || 0;
    document.getElementById('caseSensitiveExt').checked = !!profile.caseSensitiveExtensions;

    var catList = document.getElementById('categoryList');
    catList.innerHTML = '';
    CATEGORY_ORDER.forEach(function (key) {
      var cat = profile.charCategories[key];
      if (!cat) return;
      var row = document.createElement('label');
      row.className = 'switch-row';
      var span = document.createElement('span');
      span.textContent = cat.label;
      var box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = !!cat.enabled;
      box.addEventListener('change', function () {
        activeProfile().charCategories[key].enabled = box.checked;
        markDirty();
      });
      row.appendChild(span);
      row.appendChild(box);
      catList.appendChild(row);
    });

    renderExtChips(profile);
  }

  function renderExtChips(profile) {
    var wrap = document.getElementById('extChips');
    wrap.innerHTML = '';
    (profile.allowedFileExtensions || []).forEach(function (ext) {
      var chip = document.createElement('span');
      chip.className = 'chip';
      var txt = document.createElement('span');
      txt.textContent = ext;
      var rm = document.createElement('button');
      rm.textContent = '\u00d7';
      rm.addEventListener('click', function () {
        profile.allowedFileExtensions = profile.allowedFileExtensions.filter(function (e) { return e !== ext; });
        renderExtChips(profile);
        markDirty();
      });
      chip.appendChild(txt);
      chip.appendChild(rm);
      wrap.appendChild(chip);
    });
  }

  function wireRulesForm() {
    document.getElementById('profileName').addEventListener('input', function (e) {
      activeProfile().name = e.target.value;
      renderProfileList();
      renderProfileSelects();
      markDirty();
    });
    document.getElementById('profileDesc').addEventListener('input', function (e) {
      activeProfile().description = e.target.value;
      markDirty();
    });
    document.getElementById('customBanned').addEventListener('input', function (e) {
      activeProfile().customBannedChars = e.target.value;
      markDirty();
    });
    document.getElementById('customAllowed').addEventListener('input', function (e) {
      activeProfile().customAllowedChars = e.target.value;
      markDirty();
    });
    document.getElementById('blockPureNumeric').addEventListener('change', function (e) {
      activeProfile().blockPureNumericStrings = e.target.checked;
      markDirty();
    });
    document.getElementById('blockNumericSeq').addEventListener('change', function (e) {
      activeProfile().blockNumericSequences = e.target.checked;
      markDirty();
    });
    document.getElementById('maxNumericLen').addEventListener('input', function (e) {
      activeProfile().maxNumericSequenceLength = parseInt(e.target.value, 10) || 0;
      markDirty();
    });
    document.getElementById('maxFileSize').addEventListener('input', function (e) {
      activeProfile().maxFileSizeMB = parseFloat(e.target.value) || 0;
      markDirty();
    });
    document.getElementById('caseSensitiveExt').addEventListener('change', function (e) {
      activeProfile().caseSensitiveExtensions = e.target.checked;
      markDirty();
    });
    document.getElementById('addExtBtn').addEventListener('click', function () {
      var input = document.getElementById('extInput');
      var val = input.value.trim();
      if (!val) return;
      if (val[0] !== '.') val = '.' + val;
      var profile = activeProfile();
      if (!profile.allowedFileExtensions.includes(val)) {
        profile.allowedFileExtensions.push(val);
        renderExtChips(profile);
        markDirty();
      }
      input.value = '';
    });
  }

  function markDirty() {
    state.dirty = true;
    var el = document.getElementById('saveState');
    el.textContent = 'saving...';
    el.classList.add('dirty');
    clearTimeout(markDirty._t);
    markDirty._t = setTimeout(persist, 500);
  }

  async function persist() {
    await window.api.saveProfiles(state.profiles);
    state.dirty = false;
    var el = document.getElementById('saveState');
    el.textContent = 'saved';
    el.classList.remove('dirty');
  }

  // ---------- live test ----------

  function wireLiveTest() {
    var textInput = document.getElementById('testTextInput');
    var profileSelect = document.getElementById('testProfileSelect');
    var resultBox = document.getElementById('testTextResult');

    function run() {
      var profile = state.profiles.find(function (p) { return p.name === profileSelect.value; }) || activeProfile();
      var res = Core.sanitizeText(textInput.value, profile);
      resultBox.classList.remove('idle', 'valid', 'invalid');
      if (!textInput.value) {
        resultBox.classList.add('idle');
        resultBox.textContent = 'Waiting for input';
        return;
      }
      if (res.valid) {
        resultBox.classList.add('valid');
        resultBox.textContent = 'Accepted \u2014 no violations';
      } else {
        resultBox.classList.add('invalid');
        resultBox.innerHTML = 'Rejected<ul>' + res.reasons.map(function (r) { return '<li>' + escapeHtml(r) + '</li>'; }).join('') + '</ul>';
      }
    }

    textInput.addEventListener('input', run);
    profileSelect.addEventListener('change', run);

    document.getElementById('chooseTestFileBtn').addEventListener('click', async function () {
      var file = await window.api.chooseTestFile();
      var nameEl = document.getElementById('testFileName');
      var box = document.getElementById('testFileResult');
      if (!file) return;
      nameEl.textContent = file.name + ' \u2014 ' + (file.size / 1024).toFixed(1) + ' KB';
      var profile = state.profiles.find(function (p) { return p.name === profileSelect.value; }) || activeProfile();
      var res = Core.validateFile(file.name, file.size, profile);
      box.classList.remove('idle', 'valid', 'invalid');
      if (res.valid) {
        box.classList.add('valid');
        box.textContent = 'Accepted \u2014 file type and size allowed';
      } else {
        box.classList.add('invalid');
        box.innerHTML = 'Rejected<ul>' + res.reasons.map(function (r) { return '<li>' + escapeHtml(r) + '</li>'; }).join('') + '</ul>';
      }
    });
  }

  // ---------- scanner ----------

  function wireScanner() {
    document.getElementById('chooseFolderBtn').addEventListener('click', async function () {
      var dir = await window.api.chooseFolder();
      if (!dir) return;
      state.scanFolder = dir;
      document.getElementById('scanFolderPath').textContent = dir;
      document.getElementById('runScanBtn').disabled = false;
    });

    document.getElementById('runScanBtn').addEventListener('click', async function () {
      var profileName = document.getElementById('scanProfileSelect').value;
      var summary = document.getElementById('scanSummary');
      summary.textContent = 'Scanning...';
      var findings = await window.api.runScan(state.scanFolder, profileName);
      state.lastScanResults = findings;
      renderFindings(findings);
      var autoCount = findings.filter(function (f) { return f.canAutoInject; }).length;
      summary.textContent = findings.length + ' entry point' + (findings.length === 1 ? '' : 's') + ' found \u2014 ' +
        autoCount + ' can be auto-wired, ' + (findings.length - autoCount) + ' need manual review.';
      document.getElementById('applyFindingsBtn').disabled = autoCount === 0;
    });

    document.getElementById('applyFindingsBtn').addEventListener('click', async function () {
      var selected = state.lastScanResults.filter(function (f) {
        var box = document.querySelector('input[data-finding-id="' + f.id + '"]');
        return box && box.checked && f.canAutoInject;
      });
      if (!selected.length) return;
      var applied = await window.api.applyFindings(selected);
      document.getElementById('applyResult').textContent =
        applied.length ? applied.length + ' file(s) patched (backups written as .bak)' : 'No changes applied';
    });
  }

  function renderFindings(findings) {
    var body = document.getElementById('findingsBody');
    body.innerHTML = '';
    findings.forEach(function (f) {
      var tr = document.createElement('tr');

      var tdCheck = document.createElement('td');
      var box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = f.canAutoInject;
      box.disabled = !f.canAutoInject;
      box.dataset.findingId = f.id;
      tdCheck.appendChild(box);

      var tdType = document.createElement('td');
      var badge = document.createElement('span');
      badge.className = 'badge ' + (f.canAutoInject ? 'auto' : 'manual');
      badge.textContent = f.type;
      tdType.appendChild(badge);

      var tdFile = document.createElement('td');
      tdFile.innerHTML = '<code>' + escapeHtml(shortenPath(f.file)) + '</code>';

      var tdLine = document.createElement('td');
      tdLine.textContent = f.line;

      var tdSnippet = document.createElement('td');
      tdSnippet.innerHTML = '<code>' + escapeHtml(f.snippet) + '</code>';

      tr.appendChild(tdCheck);
      tr.appendChild(tdType);
      tr.appendChild(tdFile);
      tr.appendChild(tdLine);
      tr.appendChild(tdSnippet);
      body.appendChild(tr);
    });
  }

  function shortenPath(p) {
    if (!state.scanFolder) return p;
    return p.startsWith(state.scanFolder) ? '.' + p.slice(state.scanFolder.length) : p;
  }

  // ---------- export ----------

  function wireExport() {
    document.getElementById('exportBtn').addEventListener('click', async function () {
      var result = document.getElementById('exportResult');
      result.textContent = 'Exporting...';
      var dir = await window.api.exportBundle(state.profiles);
      result.textContent = dir ? 'Exported to ' + dir : 'Export cancelled';
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
