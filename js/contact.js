/* ============================================================
   Contact modal.
   Pops out from the contact section button, submits through the
   same EmailJS pipeline the previous artifact-systems.io site
   used (public client-side credentials, ported verbatim).

   reCAPTCHA: dormant until a site key is provided. To enable,
   paste the site key into CONFIG.recaptchaSiteKey below — the
   invisible widget then loads, executes on submit, and its token
   is included in the send automatically. Nothing else to change.

   NOTE: the EmailJS template rejects sends without a captcha
   token (400 "g-recaptcha-response parameter not found"), so
   while no site key is configured the form falls back to opening
   a pre-filled email draft to the same inbox instead of calling
   the API. The direct API path activates with the key.
   ============================================================ */

(function () {
  "use strict";

  var CONFIG = {
    emailjs: {
      endpoint: "https://api.emailjs.com/api/v1.0/email/send",
      publicKey: "oIjRhhHXhVnBWd77E",
      serviceId: "service_dowqftg",
      templateId: "template_notification",
      toEmail: "hello@artifact-capital.com"
    },
    // Paste the Google reCAPTCHA v2 (invisible) site key here to enable.
    recaptchaSiteKey: null
  };

  var modal = document.getElementById("contact-modal");
  var openBtn = document.getElementById("contact-open");
  if (!modal || !openBtn) return;

  var panel = modal.querySelector(".contact-modal-panel");
  var form = document.getElementById("contact-form");
  var submitBtn = document.getElementById("cf-submit");
  var errorEl = document.getElementById("cf-error");
  var successEl = document.getElementById("cf-success");
  var bodyEl = document.getElementById("cf-body");
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var lastFocus = null;

  /* ---------- Open / close ---------- */

  function openModal() {
    lastFocus = document.activeElement;
    modal.hidden = false;
    document.body.style.overflow = "hidden";
    // Force a reflow so the entrance transition runs from the hidden state.
    void modal.offsetHeight;
    modal.classList.add("is-open");
    var first = form.querySelector("input[name=from_name]");
    if (first) setTimeout(function () { first.focus(); }, reduceMotion ? 0 : 200);
  }

  function closeModal() {
    modal.classList.remove("is-open");
    document.body.style.overflow = "";
    var done = function () { modal.hidden = true; };
    if (reduceMotion) done(); else setTimeout(done, 360);
    if (lastFocus) lastFocus.focus({ preventScroll: true });
  }

  openBtn.addEventListener("click", openModal);
  modal.addEventListener("click", function (e) {
    if (e.target.closest("[data-close]")) closeModal();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !modal.hidden) closeModal();
  });

  // Keep tab focus inside the dialog while it is open.
  modal.addEventListener("keydown", function (e) {
    if (e.key !== "Tab") return;
    var focusables = panel.querySelectorAll(
      'button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (!focusables.length) return;
    var first = focusables[0];
    var last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault(); first.focus();
    }
  });

  /* ---------- reCAPTCHA (dormant until a site key is set) ---------- */

  var captchaWidget = null;
  var captchaResolve = null;

  function loadCaptcha() {
    if (!CONFIG.recaptchaSiteKey) return;
    window.__cfCaptchaReady = function () {
      captchaWidget = window.grecaptcha.render("contact-captcha", {
        sitekey: CONFIG.recaptchaSiteKey,
        size: "invisible",
        callback: function (token) {
          if (captchaResolve) captchaResolve(token);
        }
      });
    };
    var s = document.createElement("script");
    s.src = "https://www.google.com/recaptcha/api.js?onload=__cfCaptchaReady&render=explicit";
    s.async = true;
    document.head.appendChild(s);
  }

  function getCaptchaToken() {
    // No key configured: resolve with null and submit without a token.
    if (!CONFIG.recaptchaSiteKey || captchaWidget === null) {
      return Promise.resolve(null);
    }
    return new Promise(function (resolve) {
      captchaResolve = resolve;
      window.grecaptcha.reset(captchaWidget);
      window.grecaptcha.execute(captchaWidget);
    });
  }

  loadCaptcha();

  /* ---------- Submission ---------- */

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    errorEl.hidden = true;
    if (!form.reportValidity()) return;

    // Honeypot: pretend success for bots, send nothing.
    if (form.elements.website.value) {
      bodyEl.hidden = true;
      successEl.hidden = false;
      return;
    }

    var data = {
      name: form.elements.from_name.value.trim(),
      email: form.elements.from_email.value.trim(),
      company: form.elements.company.value.trim(),
      interestedIn: form.elements.interested_in.value,
      message: form.elements.message.value.trim()
    };

    // Same message block format the previous site sent.
    var block =
      "Name: " + data.name + "\n" +
      "Email: " + data.email + "\n" +
      "Company: " + data.company + "\n" +
      "Interested In: " + data.interestedIn + "\n" +
      "Message: " + data.message;

    // Interim path (no captcha key yet): the EmailJS template refuses
    // token-less sends, so open a pre-filled draft instead.
    if (!CONFIG.recaptchaSiteKey) {
      var subject = "Access request — " + (data.company || data.name);
      window.location.href =
        "mailto:" + CONFIG.emailjs.toEmail +
        "?subject=" + encodeURIComponent(subject) +
        "&body=" + encodeURIComponent(block);
      var title = document.getElementById("cf-success-title");
      var sub = document.getElementById("cf-success-sub");
      if (title) title.textContent = "Almost there.";
      if (sub) sub.textContent =
        "We’ve opened a pre-filled email draft — press send in your mail app to complete your request.";
      bodyEl.hidden = true;
      successEl.hidden = false;
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Sending…";

    getCaptchaToken().then(function (token) {
      var params = {
        to_email: CONFIG.emailjs.toEmail,
        from_name: data.name,
        from_email: data.email,
        company: data.company,
        interested_in: data.interestedIn,
        message: block
      };
      if (token) params["g-recaptcha-response"] = token;

      return fetch(CONFIG.emailjs.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lib_version: "4.4.1",
          user_id: CONFIG.emailjs.publicKey,
          service_id: CONFIG.emailjs.serviceId,
          template_id: CONFIG.emailjs.templateId,
          template_params: params
        })
      });
    }).then(function (res) {
      if (!res || !res.ok) throw new Error("send failed");
      bodyEl.hidden = true;
      successEl.hidden = false;
    }).catch(function () {
      errorEl.hidden = false;
    }).finally(function () {
      submitBtn.disabled = false;
      submitBtn.textContent = "Send request";
    });
  });
})();
