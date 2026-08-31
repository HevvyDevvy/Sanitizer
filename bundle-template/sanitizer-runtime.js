/**
 * Sanitizer — drop-in runtime
 * ----------------------------
 * Include this after sanitizer-core.js and sanitizer-profiles.js:
 *
 *   <script src="sanitizer-core.js"></script>
 *   <script src="sanitizer-profiles.js"></script>
 *   <script src="sanitizer-runtime.js"></script>
 *
 * Any element carrying data-sanitize-profile="Profile Name" is wired up
 * automatically:
 *   - <input>/<textarea>: live validation on input, blocks form submit
 *     if the field is currently invalid, shows an inline message.
 *   - <input type="file">: validated on change against the same profile's
 *     file rules (extension + size).
 *
 * No profile attribute? No effect — this never touches unwired elements.
 */
(function () {
  'use strict';

  if (typeof window === 'undefined' || !window.SanitizerCore) return;

  var Core = window.SanitizerCore;
  var PROFILES = window.SANITIZER_PROFILES || [];

  function getProfile(name) {
    return PROFILES.find(function (p) { return p.name === name; }) || Core.DEFAULT_PROFILE;
  }

  function ensureMessageEl(el) {
    var next = el.nextElementSibling;
    if (next && next.classList && next.classList.contains('sanitizer-msg')) return next;
    var msg = document.createElement('div');
    msg.className = 'sanitizer-msg';
    msg.style.cssText = 'display:none;font-size:12px;color:#c0304a;margin-top:4px;';
    el.insertAdjacentElement('afterend', msg);
    return msg;
  }

  function showInvalid(el, msg, reasons) {
    el.setAttribute('data-sanitize-valid', 'false');
    el.setAttribute('aria-invalid', 'true');
    msg.textContent = reasons.length === 1 ? reasons[0] : 'Invalid characters detected.';
    msg.style.display = 'block';
  }

  function showValid(el, msg) {
    el.setAttribute('data-sanitize-valid', 'true');
    el.removeAttribute('aria-invalid');
    msg.style.display = 'none';
    msg.textContent = '';
  }

  function wireTextField(el) {
    var profileName = el.getAttribute('data-sanitize-profile');
    var profile = getProfile(profileName);
    var msg = ensureMessageEl(el);

    function validate() {
      var res = Core.sanitizeText(el.value, profile);
      if (res.valid) showValid(el, msg);
      else showInvalid(el, msg, res.reasons);
      return res.valid;
    }

    el.addEventListener('input', validate);
    el.addEventListener('blur', validate);
    validate();

    var form = el.closest('form');
    if (form && !form.hasAttribute('data-sanitizer-wired')) {
      form.setAttribute('data-sanitizer-wired', 'true');
      form.addEventListener('submit', function (e) {
        var fields = form.querySelectorAll('[data-sanitize-profile]');
        var ok = true;
        fields.forEach(function (f) {
          if (f.type === 'file') return;
          var p = getProfile(f.getAttribute('data-sanitize-profile'));
          var r = Core.sanitizeText(f.value, p);
          var m = ensureMessageEl(f);
          if (r.valid) showValid(f, m); else { showInvalid(f, m, r.reasons); ok = false; }
        });
        if (!ok) e.preventDefault();
      });
    }
  }

  function wireFileField(el) {
    var profileName = el.getAttribute('data-sanitize-profile');
    var profile = getProfile(profileName);
    var msg = ensureMessageEl(el);

    el.addEventListener('change', function () {
      var file = el.files && el.files[0];
      if (!file) { showValid(el, msg); return; }
      var res = Core.validateFile(file.name, file.size, profile);
      if (res.valid) showValid(el, msg);
      else { showInvalid(el, msg, res.reasons); el.value = ''; }
    });
  }

  function wireAll(root) {
    root = root || document;
    root.querySelectorAll('[data-sanitize-profile]').forEach(function (el) {
      if (el.dataset.sanitizerBound) return;
      el.dataset.sanitizerBound = 'true';
      if (el.tagName === 'INPUT' && el.type === 'file') wireFileField(el);
      else if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') wireTextField(el);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { wireAll(); });
  } else {
    wireAll();
  }

  // Re-scan on DOM mutation so dynamically-added fields get wired too.
  if (typeof MutationObserver !== 'undefined') {
    new MutationObserver(function () { wireAll(); }).observe(document.documentElement, {
      childList: true, subtree: true
    });
  }

  window.SanitizerRuntime = { wireAll: wireAll, getProfile: getProfile };
})();
