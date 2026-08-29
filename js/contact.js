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
    // Google reCAPTCHA v2 (invisible) site key — public by design; the
    // matching secret key lives only in the EmailJS dashboard.
    recaptchaSiteKey: "6LfoKFsrAAAAANiMGFpWg7K81NfwKV4nPnPfYUKm"
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

  // If a nav CTA points at #contact and the contact section is already
  // on screen, open the form directly instead of scrolling nowhere.
  // Currently inert: the nav CTA is the Log In link. This re-arms by
  // itself if a #contact button returns to the nav or mobile menu.
  var navCtas = document.querySelectorAll(
    'a.btn-nav[href="#contact"], a.mobile-menu-cta[href="#contact"]'
  );
  Array.prototype.forEach.call(navCtas, function (a) {
    a.addEventListener("click", function (e) {
      var contact = document.getElementById("contact");
      if (!contact) return;
      var r = contact.getBoundingClientRect();
      if (r.top < window.innerHeight * 0.6 && r.bottom > 0) {
        e.preventDefault();
        openModal();
      }
    });
  });
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

  /* ---------- "Interested in" dropdown ---------- */

  var sel = document.getElementById("cf-select");
  var selBtn = document.getElementById("cf-select-btn");
  var selMenu = document.getElementById("cf-select-menu");
  var selValue = document.getElementById("cf-select-value");
  var selInput = form.elements.interested_in;
  var selOptions = Array.prototype.slice.call(selMenu.querySelectorAll("[role=option]"));

  function selOpen() {
    selMenu.hidden = false;
    sel.classList.add("is-open");
    selBtn.setAttribute("aria-expanded", "true");
    var current = selOptions.filter(function (o) {
      return o.getAttribute("aria-selected") === "true";
    })[0];
    (current || selOptions[0]).focus();
  }

  function selClose(refocus) {
    selMenu.hidden = true;
    sel.classList.remove("is-open");
    selBtn.setAttribute("aria-expanded", "false");
    if (refocus) selBtn.focus();
  }

  // Multi-select: toggling a checkbox keeps the menu open.
  function selToggle(option) {
    var selected = option.getAttribute("aria-selected") === "true";
    option.setAttribute("aria-selected", selected ? "false" : "true");
    var picked = selOptions.filter(function (o) {
      return o.getAttribute("aria-selected") === "true";
    }).map(function (o) { return o.getAttribute("data-value"); });
    selInput.value = picked.join(", ");
    if (picked.length) {
      selValue.textContent = picked.join(", ");
      selValue.classList.remove("is-placeholder");
      sel.classList.remove("is-invalid");
    } else {
      selValue.textContent = "Select all that apply";
      selValue.classList.add("is-placeholder");
    }
  }

  selBtn.addEventListener("click", function () {
    if (selMenu.hidden) selOpen(); else selClose(true);
  });
  selBtn.addEventListener("keydown", function (e) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      selOpen();
    }
  });
  selMenu.addEventListener("keydown", function (e) {
    var i = selOptions.indexOf(document.activeElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      selOptions[Math.min(i + 1, selOptions.length - 1)].focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      selOptions[Math.max(i - 1, 0)].focus();
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (i >= 0) selToggle(selOptions[i]);
    } else if (e.key === "Escape") {
      e.stopPropagation();
      selClose(true);
    } else if (e.key === "Tab") {
      selClose(false);
    }
  });
  selMenu.addEventListener("click", function (e) {
    var option = e.target.closest("[role=option]");
    if (option) selToggle(option);
  });
  document.addEventListener("click", function (e) {
    if (!selMenu.hidden && !sel.contains(e.target)) selClose(false);
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
        },
        "error-callback": function () {
          if (captchaResolve) captchaResolve(null);
        }
      });
    };
    var s = document.createElement("script");
    s.src = "https://www.google.com/recaptcha/api.js?onload=__cfCaptchaReady&render=explicit";
    s.async = true;
    document.head.appendChild(s);
  }

  function getCaptchaToken() {
    // No key configured or widget failed to load: resolve with null.
    if (!CONFIG.recaptchaSiteKey || captchaWidget === null) {
      return Promise.resolve(null);
    }
    return new Promise(function (resolve) {
      var settled = false;
      captchaResolve = function (token) {
        if (settled) return;
        settled = true;
        resolve(token);
      };
      // Never hang the form on a stuck challenge.
      setTimeout(function () { captchaResolve(null); }, 30000);
      try {
        window.grecaptcha.reset(captchaWidget);
        window.grecaptcha.execute(captchaWidget);
      } catch (err) {
        captchaResolve(null);
      }
    });
  }

  loadCaptcha();

  /* ---------- Submission ---------- */

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    errorEl.hidden = true;
    if (!form.reportValidity()) return;
    // Hidden inputs skip native required validation.
    if (!selInput.value) {
      sel.classList.add("is-invalid");
      selBtn.focus();
      return;
    }

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

    // Fallback: the EmailJS template refuses token-less sends, so when
    // no captcha token is available, open a pre-filled draft instead.
    function openDraft() {
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
    }

    if (!CONFIG.recaptchaSiteKey) {
      openDraft();
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Sending…";

    getCaptchaToken().then(function (token) {
      if (!token) {
        openDraft();
        return "drafted";
      }
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
      if (res === "drafted") return;
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
