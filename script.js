(function () {
  "use strict";

  const page = document.body.getAttribute("data-page") || "home";
  const yearEl = document.getElementById("year");
  const navToggle = document.getElementById("nav-toggle");
  const packageGrid = document.getElementById("package-grid");

  const ITIN_PACKAGE = {
    id: "itin",
    title: "Get Your ITIN",
    paymentLink: "https://buy.stripe.com/3cI8wQ0FV8eKcoM4as9sk07",
    requiresPassport: true,
  };

  let packages = [];
  let allowTestPayment = false;
  let currentPackage = ITIN_PACKAGE;

  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  if (navToggle) {
    navToggle.addEventListener("click", function () {
      const open = document.body.classList.toggle("nav-open");
      navToggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    document.querySelectorAll(".nav a").forEach(function (a) {
      a.addEventListener("click", function () {
        document.body.classList.remove("nav-open");
      });
    });
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function stripeUrl(pkg) {
    const url = new URL(pkg.paymentLink);
    url.searchParams.set("client_reference_id", pkg.id);
    return url.toString();
  }

  function packageIcon(id) {
    if (id === "itin") return { cls: "package__icon package__icon--itin", icon: "bi-person-badge-fill" };
    if (id === "elite") return { cls: "package__icon package__icon--elite", icon: "bi-trophy-fill" };
    return { cls: "package__icon", icon: "bi-building" };
  }

  function startStripe(pkg) {
    try {
      localStorage.setItem("jgv_pending_pkg", pkg.id);
    } catch (e) {}
    window.location.href = stripeUrl(pkg);
  }

  /* --- Home: packages only --- */
  function renderPackages() {
    if (!packageGrid) return;
    packageGrid.innerHTML = packages
      .map(function (pkg) {
        const featured = pkg.featured ? " package--featured" : "";
        const badgeClass = pkg.id === "elite" ? " package__badge--elite" : "";
        const ic = packageIcon(pkg.id);
        const list = (pkg.highlights || [])
          .map(function (h) {
            return '<li><i class="bi bi-check-circle-fill" aria-hidden="true"></i>' + escapeHtml(h) + "</li>";
          })
          .join("");

        var cta;
        if (pkg.id === "itin") {
          cta =
            '<a class="btn btn-orange" href="get-itin.html"><i class="bi bi-person-badge-fill" aria-hidden="true"></i> Get Your ITIN</a>';
        } else if (pkg.id === "llc_ein_address") {
          cta =
            '<a class="btn btn-orange" href="get-llc.html"><i class="bi bi-building" aria-hidden="true"></i> Start LLC setup</a>';
        } else {
          cta =
            '<button type="button" class="btn btn-orange package-pay" data-package="' +
            escapeHtml(pkg.id) +
            '"><i class="bi bi-credit-card-fill" aria-hidden="true"></i> Pay</button>';
        }

        return (
          '<article class="package' +
          featured +
          '" data-package="' +
          escapeHtml(pkg.id) +
          '">' +
          '<div class="' +
          ic.cls +
          '"><i class="bi ' +
          ic.icon +
          '" aria-hidden="true"></i></div>' +
          '<div><span class="package__badge' +
          badgeClass +
          '">' +
          escapeHtml(pkg.badge || "") +
          "</span>" +
          "<h3>" +
          escapeHtml(pkg.title) +
          "</h3>" +
          '<p class="package__tagline">' +
          escapeHtml(pkg.tagline || "") +
          "</p></div>" +
          '<p class="package__desc">' +
          escapeHtml(pkg.description || "") +
          "</p>" +
          '<ul class="package__list">' +
          list +
          "</ul>" +
          cta +
          "</article>"
        );
      })
      .join("");

    packageGrid.querySelectorAll(".package-pay").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const id = btn.getAttribute("data-package");
        const pkg = packages.find(function (p) {
          return p.id === id;
        });
        if (pkg) startStripe(pkg);
      });
    });
  }

  /* --- ITIN page: pay → emailed form link → submit → admin email --- */
  function initItinPage() {
    const form = document.getElementById("itin-form");
    const alertEl = document.getElementById("alert");
    const stepForm = document.getElementById("step-form");
    const stepPayment = document.getElementById("step-payment");
    const stepDone = document.getElementById("step-done");
    const payBtn = document.getElementById("itin-pay-btn");
    const testRow = document.getElementById("test-row");
    const testPayBtn = document.getElementById("test-pay-btn");
    const submitBtn = document.getElementById("submit-form-btn");
    const passportInput = document.getElementById("passport");
    const doneMessage = document.getElementById("done-message");
    const wizard = document.getElementById("wizard");
    const applyLead = document.getElementById("apply-lead");

    if (!form) return;

    let paymentToken = null;

    const itinFromApi = packages.find(function (p) {
      return p.id === "itin";
    });
    if (itinFromApi) currentPackage = itinFromApi;

    function showAlert(type, message) {
      if (!alertEl) return;
      alertEl.className = "alert show alert-" + type;
      alertEl.textContent = message;
      alertEl.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    function clearAlert() {
      if (!alertEl) return;
      alertEl.className = "alert";
      alertEl.textContent = "";
    }

    function setWizard(step) {
      if (!wizard) return;
      wizard.querySelectorAll(".wizard__step").forEach(function (el) {
        const n = Number(el.getAttribute("data-step"));
        el.classList.toggle("is-active", n === step);
        el.classList.toggle("is-done", n < step);
      });
    }

    function showStep(name) {
      stepForm.hidden = name !== "form";
      stepPayment.hidden = name !== "payment";
      stepDone.hidden = name !== "done";
      if (name === "payment") setWizard(1);
      if (name === "form") setWizard(2);
      if (name === "done") setWizard(3);
    }

    function storePayment(data) {
      paymentToken = data.payment_token;
      try {
        localStorage.setItem(
          "jgv_payment",
          JSON.stringify({
            payment_token: data.payment_token,
            package_id: data.package_id || "itin",
            package_title: data.package_title || currentPackage.title,
            email: data.email || "",
            expires_at: data.expires_at,
            form_link: data.form_link || "",
          })
        );
      } catch (e) {}
    }

    function unlockForm(token, opts) {
      opts = opts || {};
      paymentToken = token;
      showStep("form");
      if (applyLead) {
        applyLead.textContent =
          "Payment confirmed. Complete the form below. When you submit, our team receives your application by email.";
      }
      if (opts.message) showAlert("success", opts.message);
      else showAlert("success", "Payment verified. Please complete and submit your application.");
      const applyEl = document.getElementById("apply");
      if (applyEl) applyEl.scrollIntoView({ behavior: "smooth" });
    }

    function fileToPayload(file) {
      return new Promise(function (resolve, reject) {
        if (!file) {
          resolve(null);
          return;
        }
        if (file.size > 4.5 * 1024 * 1024) {
          reject(new Error(file.name + " is too large (max 4.5 MB)."));
          return;
        }
        const reader = new FileReader();
        reader.onload = function () {
          resolve({
            name: file.name,
            type: file.type || "application/octet-stream",
            data: String(reader.result || ""),
          });
        };
        reader.onerror = function () {
          reject(new Error("Could not read " + file.name));
        };
        reader.readAsDataURL(file);
      });
    }

    async function buildPayload() {
      if (!form.checkValidity()) {
        form.reportValidity();
        throw new Error("Please complete all required fields.");
      }
      if (!passportInput.files || !passportInput.files[0]) {
        throw new Error("Passport scan is required.");
      }
      if (!paymentToken) {
        throw new Error("Missing payment session. Please pay first, then open the link from your email.");
      }
      return {
        payment_token: paymentToken,
        package_id: "itin",
        first_name: document.getElementById("first_name").value,
        middle_name: document.getElementById("middle_name").value,
        last_name: document.getElementById("last_name").value,
        phone: document.getElementById("phone").value,
        birth_name: document.getElementById("birth_name").value,
        email: document.getElementById("email").value,
        street: document.getElementById("street").value,
        city: document.getElementById("city").value,
        state: document.getElementById("state").value,
        country: document.getElementById("country").value,
        postal: document.getElementById("postal").value,
        has_llc: (form.querySelector('input[name="has_llc"]:checked') || {}).value || "",
        ownership: document.getElementById("ownership").value,
        files: {
          passport: await fileToPayload(passportInput.files[0]),
          llc_docs: await fileToPayload(document.getElementById("llc_docs").files[0]),
          ein_doc: await fileToPayload(document.getElementById("ein_doc").files[0]),
        },
      };
    }

    document.querySelectorAll(".file-drop").forEach(function (drop) {
      const input = drop.querySelector('input[type="file"]');
      const nameEl = drop.querySelector(".file-name");
      if (!input) return;
      input.addEventListener("change", function () {
        if (nameEl) nameEl.textContent = input.files && input.files[0] ? input.files[0].name : "";
      });
      ["dragenter", "dragover"].forEach(function (evt) {
        drop.addEventListener(evt, function (e) {
          e.preventDefault();
          drop.classList.add("dragover");
        });
      });
      ["dragleave", "drop"].forEach(function (evt) {
        drop.addEventListener(evt, function (e) {
          e.preventDefault();
          drop.classList.remove("dragover");
        });
      });
      drop.addEventListener("drop", function (e) {
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
          input.files = e.dataTransfer.files;
          input.dispatchEvent(new Event("change"));
        }
      });
    });

    if (payBtn) {
      payBtn.addEventListener("click", function () {
        clearAlert();
        startStripe(currentPackage.paymentLink ? currentPackage : ITIN_PACKAGE);
      });
    }

    if (testPayBtn) {
      testPayBtn.addEventListener("click", async function () {
        testPayBtn.disabled = true;
        try {
          const res = await fetch("/api/verify-payment", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              test: true,
              package_id: "itin",
            }),
          });
          const json = await res.json();
          if (!res.ok || !json.ok) throw new Error(json.message || "Test payment failed");
          storePayment(json);
          var msg = "Test payment OK.";
          if (json.form_email_sent) msg += " Form link emailed.";
          else if (json.form_link) msg += " Open the form below (email may be skipped in test).";
          unlockForm(json.payment_token, { message: msg });
        } catch (err) {
          showAlert("error", err.message || "Test payment failed");
        } finally {
          testPayBtn.disabled = false;
        }
      });
    }

    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      clearAlert();
      if (submitBtn) {
        submitBtn.classList.add("loading");
        submitBtn.disabled = true;
      }
      try {
        const payload = await buildPayload();
        const res = await fetch("/api/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = await res.json().catch(function () {
          return { ok: false, message: "Unexpected server response." };
        });
        if (!res.ok || !json.ok) throw new Error(json.message || "Could not send application.");
        try {
          localStorage.removeItem("jgv_payment");
        } catch (err) {}
        paymentToken = null;
        if (doneMessage) {
          doneMessage.textContent =
            json.message ||
            "Thank you. Your form was emailed to our team. We will contact you shortly.";
        }
        showStep("done");
        document.getElementById("apply").scrollIntoView({ behavior: "smooth" });
      } catch (err) {
        showAlert("error", err.message || "Submission failed.");
      } finally {
        if (submitBtn) {
          submitBtn.classList.remove("loading");
          submitBtn.disabled = false;
        }
      }
    });

    if (allowTestPayment && testRow) testRow.hidden = false;

    // Default: payment first
    showStep("payment");

    // Unlock via emailed link ?token=...
    (function openFromToken() {
      try {
        const params = new URLSearchParams(window.location.search);
        const token = params.get("token");
        if (!token) return false;
        storePayment({
          payment_token: token,
          package_id: "itin",
          package_title: currentPackage.title,
        });
        unlockForm(token, {
          message: "Secure link verified. Complete the form and submit your application.",
        });
        // Clean token from URL without reload
        if (window.history && window.history.replaceState) {
          const clean = window.location.pathname + window.location.hash;
          window.history.replaceState({}, "", clean);
        }
        return true;
      } catch (e) {
        return false;
      }
    })();

    // Or resume from payment-return localStorage if user clicked through without email
    if (!paymentToken) {
      try {
        const raw = localStorage.getItem("jgv_payment");
        if (raw) {
          const data = JSON.parse(raw);
          if (data.payment_token && data.package_id === "itin") {
            if (data.expires_at && Date.now() > data.expires_at) {
              localStorage.removeItem("jgv_payment");
            } else {
              unlockForm(data.payment_token, {
                message: "Payment session found. Complete and submit your application.",
              });
            }
          }
        }
      } catch (e) {}
    }
  }

  /* --- LLC page: pay → emailed form link → submit → admin email --- */
  const LLC_PACKAGE = {
    id: "llc_ein_address",
    title: "LLC + EIN + Business Address",
    paymentLink: "https://buy.stripe.com/3cI9AU2O3eD8dsQ9uM9sk08",
    requiresPassport: true,
  };

  function initLlcPage() {
    const form = document.getElementById("llc-form");
    const alertEl = document.getElementById("alert");
    const stepForm = document.getElementById("step-form");
    const stepPayment = document.getElementById("step-payment");
    const stepDone = document.getElementById("step-done");
    const payBtn = document.getElementById("llc-pay-btn");
    const testRow = document.getElementById("test-row");
    const testPayBtn = document.getElementById("test-pay-btn");
    const submitBtn = document.getElementById("submit-form-btn");
    const passportInput = document.getElementById("passport");
    const itinOrSsnInput = document.getElementById("itin_or_ssn");
    const doneMessage = document.getElementById("done-message");
    const wizard = document.getElementById("wizard");
    const applyLead = document.getElementById("apply-lead");

    if (!form) return;

    let paymentToken = null;
    let pkg = LLC_PACKAGE;
    const fromApi = packages.find(function (p) {
      return p.id === "llc_ein_address";
    });
    if (fromApi) pkg = fromApi;

    function showAlert(type, message) {
      if (!alertEl) return;
      alertEl.className = "alert show alert-" + type;
      alertEl.textContent = message;
      alertEl.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    function clearAlert() {
      if (!alertEl) return;
      alertEl.className = "alert";
      alertEl.textContent = "";
    }

    function setWizard(step) {
      if (!wizard) return;
      wizard.querySelectorAll(".wizard__step").forEach(function (el) {
        const n = Number(el.getAttribute("data-step"));
        el.classList.toggle("is-active", n === step);
        el.classList.toggle("is-done", n < step);
      });
    }

    function showStep(name) {
      stepForm.hidden = name !== "form";
      stepPayment.hidden = name !== "payment";
      stepDone.hidden = name !== "done";
      if (name === "payment") setWizard(1);
      if (name === "form") setWizard(2);
      if (name === "done") setWizard(3);
    }

    function storePayment(data) {
      paymentToken = data.payment_token;
      try {
        localStorage.setItem(
          "jgv_payment",
          JSON.stringify({
            payment_token: data.payment_token,
            package_id: data.package_id || "llc_ein_address",
            package_title: data.package_title || pkg.title,
            email: data.email || "",
            expires_at: data.expires_at,
            form_link: data.form_link || "",
          })
        );
      } catch (e) {}
    }

    function unlockForm(token, opts) {
      opts = opts || {};
      paymentToken = token;
      showStep("form");
      if (applyLead) {
        applyLead.textContent =
          "Payment confirmed. Complete the form below. When you submit, our team receives your application by email.";
      }
      if (opts.message) showAlert("success", opts.message);
      else showAlert("success", "Payment verified. Please complete and submit your application.");
      const applyEl = document.getElementById("apply");
      if (applyEl) applyEl.scrollIntoView({ behavior: "smooth" });
    }

    function fileToPayload(file) {
      return new Promise(function (resolve, reject) {
        if (!file) {
          resolve(null);
          return;
        }
        if (file.size > 4.5 * 1024 * 1024) {
          reject(new Error(file.name + " is too large (max 4.5 MB)."));
          return;
        }
        const reader = new FileReader();
        reader.onload = function () {
          resolve({
            name: file.name,
            type: file.type || "application/octet-stream",
            data: String(reader.result || ""),
          });
        };
        reader.onerror = function () {
          reject(new Error("Could not read " + file.name));
        };
        reader.readAsDataURL(file);
      });
    }

    async function buildPayload() {
      if (!form.checkValidity()) {
        form.reportValidity();
        throw new Error("Please complete all required fields.");
      }
      if (!passportInput.files || !passportInput.files[0]) {
        throw new Error("Passport is required.");
      }
      if (!itinOrSsnInput.files || !itinOrSsnInput.files[0]) {
        throw new Error("ITIN or SSN document is required.");
      }
      if (!paymentToken) {
        throw new Error("Missing payment session. Please pay first, then open the link from your email.");
      }
      return {
        payment_token: paymentToken,
        package_id: "llc_ein_address",
        business_name: document.getElementById("business_name").value,
        registry_state: (form.querySelector('input[name="registry_state"]:checked') || {}).value || "",
        first_name: document.getElementById("first_name").value,
        middle_name: document.getElementById("middle_name").value,
        last_name: document.getElementById("last_name").value,
        phone: document.getElementById("phone").value,
        email: document.getElementById("email").value,
        files: {
          passport: await fileToPayload(passportInput.files[0]),
          itin_or_ssn: await fileToPayload(itinOrSsnInput.files[0]),
        },
      };
    }

    document.querySelectorAll(".file-drop").forEach(function (drop) {
      const input = drop.querySelector('input[type="file"]');
      const nameEl = drop.querySelector(".file-name");
      if (!input) return;
      input.addEventListener("change", function () {
        if (nameEl) nameEl.textContent = input.files && input.files[0] ? input.files[0].name : "";
      });
      ["dragenter", "dragover"].forEach(function (evt) {
        drop.addEventListener(evt, function (e) {
          e.preventDefault();
          drop.classList.add("dragover");
        });
      });
      ["dragleave", "drop"].forEach(function (evt) {
        drop.addEventListener(evt, function (e) {
          e.preventDefault();
          drop.classList.remove("dragover");
        });
      });
      drop.addEventListener("drop", function (e) {
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
          input.files = e.dataTransfer.files;
          input.dispatchEvent(new Event("change"));
        }
      });
    });

    if (payBtn) {
      payBtn.addEventListener("click", function () {
        clearAlert();
        startStripe(pkg.paymentLink ? pkg : LLC_PACKAGE);
      });
    }

    if (testPayBtn) {
      testPayBtn.addEventListener("click", async function () {
        testPayBtn.disabled = true;
        try {
          const res = await fetch("/api/verify-payment", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              test: true,
              package_id: "llc_ein_address",
            }),
          });
          const json = await res.json();
          if (!res.ok || !json.ok) throw new Error(json.message || "Test payment failed");
          storePayment(json);
          var msg = "Test payment OK.";
          if (json.form_email_sent) msg += " Form link emailed.";
          else if (json.form_link) msg += " Open the form below (email may be skipped in test).";
          unlockForm(json.payment_token, { message: msg });
        } catch (err) {
          showAlert("error", err.message || "Test payment failed");
        } finally {
          testPayBtn.disabled = false;
        }
      });
    }

    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      clearAlert();
      if (submitBtn) {
        submitBtn.classList.add("loading");
        submitBtn.disabled = true;
      }
      try {
        const payload = await buildPayload();
        const res = await fetch("/api/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = await res.json().catch(function () {
          return { ok: false, message: "Unexpected server response." };
        });
        if (!res.ok || !json.ok) throw new Error(json.message || "Could not send application.");
        try {
          localStorage.removeItem("jgv_payment");
        } catch (err) {}
        paymentToken = null;
        if (doneMessage) {
          doneMessage.textContent =
            json.message ||
            "Thank you. Your form was emailed to our team. We will contact you shortly.";
        }
        showStep("done");
        document.getElementById("apply").scrollIntoView({ behavior: "smooth" });
      } catch (err) {
        showAlert("error", err.message || "Submission failed.");
      } finally {
        if (submitBtn) {
          submitBtn.classList.remove("loading");
          submitBtn.disabled = false;
        }
      }
    });

    if (allowTestPayment && testRow) testRow.hidden = false;

    showStep("payment");

    (function openFromToken() {
      try {
        const params = new URLSearchParams(window.location.search);
        const token = params.get("token");
        if (!token) return false;
        storePayment({
          payment_token: token,
          package_id: "llc_ein_address",
          package_title: pkg.title,
        });
        unlockForm(token, {
          message: "Secure link verified. Complete the form and submit your application.",
        });
        if (window.history && window.history.replaceState) {
          const clean = window.location.pathname + window.location.hash;
          window.history.replaceState({}, "", clean);
        }
        return true;
      } catch (e) {
        return false;
      }
    })();

    if (!paymentToken) {
      try {
        const raw = localStorage.getItem("jgv_payment");
        if (raw) {
          const data = JSON.parse(raw);
          if (data.payment_token && data.package_id === "llc_ein_address") {
            if (data.expires_at && Date.now() > data.expires_at) {
              localStorage.removeItem("jgv_payment");
            } else {
              unlockForm(data.payment_token, {
                message: "Payment session found. Complete and submit your application.",
              });
            }
          }
        }
      } catch (e) {}
    }
  }

  const fallbackPackages = [
    {
      id: "llc_ein_address",
      title: "LLC + EIN + Business Address",
      tagline: "U.S. business foundation",
      description:
        "A complete U.S. business setup including LLC formation, EIN registration, and a professional business address to establish credibility, receive mail, and operate legally.",
      paymentLink: "https://buy.stripe.com/3cI9AU2O3eD8dsQ9uM9sk08",
      badge: "Setup",
      requiresPassport: false,
      highlights: ["LLC formation filing", "EIN registration", "Professional business address"],
    },
    {
      id: "itin",
      title: "Get Your ITIN",
      tagline: "Official U.S. tax ID",
      description:
        "Get your official ITIN, the U.S. tax ID for individuals who don’t qualify for a Social Security Number. Full application handling and document review.",
      paymentLink: "https://buy.stripe.com/3cI8wQ0FV8eKcoM4as9sk07",
      badge: "ITIN",
      requiresPassport: true,
      highlights: ["Full application handling", "Professional document review", "Typical IRS timing 6-12 weeks"],
    },
    {
      id: "elite",
      title: "Elite USA Program",
      tagline: "LLC + EIN + ITIN + 12 months coaching",
      description:
        "A complete U.S. business setup with LLC, EIN, ITIN, Business Address, plus 12 months of coaching.",
      paymentLink: "https://buy.stripe.com/14A7sMdsH3Yu3Sg6iA9sk06",
      badge: "Elite",
      featured: true,
      requiresPassport: true,
      highlights: ["LLC + EIN + business address", "ITIN application support", "12 months of coaching"],
    },
  ];

  fetch("/api/config")
    .then(function (r) {
      return r.ok ? r.json() : null;
    })
    .then(function (cfg) {
      if (cfg && cfg.ok) {
        packages = cfg.packages || [];
        allowTestPayment = Boolean(cfg.allowTestPayment);
      } else {
        packages = fallbackPackages;
      }
      if (page === "home") renderPackages();
      if (page === "itin") initItinPage();
      if (page === "llc") initLlcPage();
    })
    .catch(function () {
      packages = fallbackPackages;
      if (page === "home") renderPackages();
      if (page === "itin") initItinPage();
      if (page === "llc") initLlcPage();
    });
})();
