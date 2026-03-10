/**
 * ============================================================
 *  auth.js  —  GeoLearn shared authentication module
 * ============================================================
 *  Included on every page via <script src="auth.js"></script>
 *
 *  Responsibilities:
 *   1. Cookie helpers  – set / get / delete the session cookie
 *   2. User store      – read/write the user list in localStorage
 *   3. Public API      – window.GeoAuth (saveUser, login, logout …)
 *   4. Nav avatar      – injects the profile circle + dropdown into
 *                        every page's <nav> on DOMContentLoaded
 *
 *  Data stored in the browser:
 *   • Cookie  "geolearn_session"  →  logged-in username (7-day expiry)
 *   • localStorage "geolearn_users" →  JSON array of user objects
 *
 *  Everything is wrapped in an IIFE so no variables leak to global scope
 *  except the GeoAuth object itself.
 * ============================================================
 */
(function () {

  // ── Avatar widget CSS ─────────────────────────────────────────────────────
  // All styles are injected once into <head> by injectCSS() to keep
  // the HTML files clean. Classes follow the .geo-* naming convention.
  var AVATAR_CSS = [
    '.geo-av-wrap{position:relative;margin-left:10px;flex-shrink:0}',
    '.geo-av-btn{width:38px;height:38px;border-radius:50%;display:flex;align-items:center;',
    'justify-content:center;cursor:pointer;position:relative;font-size:0.8rem;font-weight:800;',
    'letter-spacing:0.03em;transition:transform 0.15s,box-shadow 0.2s;border:2px solid transparent;user-select:none}',
    '.geo-av-btn:hover{transform:scale(1.1)}',
    '.geo-av-btn.on{background:rgba(79,142,247,0.18);color:#4f8ef7;border-color:#4f8ef7;',
    'box-shadow:0 0 0 3px rgba(79,142,247,0.22),0 0 14px rgba(79,142,247,0.45)}',
    '.geo-av-btn.off{background:rgba(139,144,168,0.13);color:#8b90a8;',
    'border-color:rgba(139,144,168,0.35);box-shadow:none}',
    '.geo-av-dot{position:absolute;bottom:1px;right:1px;width:9px;height:9px;',
    'border-radius:50%;border:2px solid #0f1117}',
    '.geo-av-dot.on{background:#34d399;box-shadow:0 0 6px #34d399}',
    '.geo-av-dot.off{background:#8b90a8}',
    '.geo-av-dd{position:absolute;top:calc(100% + 10px);right:0;background:#21253a;',
    'border:1px solid rgba(255,255,255,0.1);border-radius:14px;padding:8px;min-width:196px;',
    'box-shadow:0 16px 40px rgba(0,0,0,0.55);opacity:0;pointer-events:none;',
    'transform:translateY(-6px);transition:opacity 0.18s,transform 0.18s;z-index:300}',
    '.geo-av-wrap:hover .geo-av-dd,.geo-av-wrap:focus-within .geo-av-dd{opacity:1;pointer-events:auto;transform:translateY(0)}',
    '.geo-dd-head{padding:10px 12px 10px;border-bottom:1px solid rgba(255,255,255,0.07);margin-bottom:6px}',
    '.geo-dd-name{font-size:0.88rem;font-weight:700;color:#e8eaf6}',
    '.geo-dd-uname{font-size:0.73rem;color:#8b90a8;margin-top:2px}',
    '.geo-dd-status{display:flex;align-items:center;gap:6px;font-size:0.73rem;margin-top:7px}',
    '.geo-dd-sdot{width:7px;height:7px;border-radius:50%;flex-shrink:0}',
    '.geo-dd-sdot.on{background:#34d399;box-shadow:0 0 5px #34d399}',
    '.geo-dd-sdot.off{background:#8b90a8}',
    '.geo-dd-btn{display:block;width:100%;text-align:left;background:none;border:none;',
    'border-radius:8px;padding:9px 12px;font-size:0.86rem;cursor:pointer;',
    'font-family:\'Segoe UI\',Arial,sans-serif;transition:background 0.15s;text-decoration:none}',
    '.geo-dd-btn:hover{background:rgba(255,255,255,0.06)}',
    '.geo-dd-btn.out{color:#f87171}.geo-dd-btn.in{color:#4f8ef7}.geo-dd-btn.reg{color:#8b90a8}'
  ].join('');

  // Inject the avatar CSS once; guarded by id so re-calling is safe.
  function injectCSS() {
    if (document.getElementById('geo-auth-css')) return;
    var s = document.createElement('style');
    s.id = 'geo-auth-css';
    s.textContent = AVATAR_CSS;
    document.head.appendChild(s);
  }

  // ── Cookie helpers ────────────────────────────────────────────────────────
  // setCookie: writes name=value with an expiry N days from now.
  // getCookie: returns the value string or null if not found.
  // deleteCookie: expires the cookie immediately (max-age=0).
  function setCookie(name, value, days) {
    var d = new Date();
    d.setTime(d.getTime() + days * 86400000);
    document.cookie =
      name + '=' + encodeURIComponent(value) +
      '; expires=' + d.toUTCString() +
      '; path=/; SameSite=Lax';
  }

  function getCookie(name) {
    var re = new RegExp('(?:^|; )' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]*)');
    var m = document.cookie.match(re);
    return m ? decodeURIComponent(m[1]) : null;
  }

  function deleteCookie(name) {
    document.cookie = name + '=; max-age=0; path=/; SameSite=Lax';
  }

  // ── User store (localStorage) ─────────────────────────────────────────────
  // Users are persisted as a JSON array under the key "geolearn_users".
  // Each entry is the full userData object collected during registration.
  // Returns an empty array (never throws) so the rest of the code is safe.
  function getUsers() {
    try { return JSON.parse(localStorage.getItem('geolearn_users') || '[]'); }
    catch (e) { return []; }
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  // Exposed as window.GeoAuth so every page script can call these methods.
  window.GeoAuth = {

    // Append a new user object to the localStorage user array.
    saveUser: function (user) {
      var users = getUsers();
      users.push(user);
      localStorage.setItem('geolearn_users', JSON.stringify(users));
    },

    // Returns true if a username is already taken (case-insensitive check).
    usernameExists: function (username) {
      return getUsers().some(function (u) {
        return u.username.toLowerCase() === username.toLowerCase();
      });
    },

    // Match username + password against the stored users.
    // On success: sets the session cookie and returns the user object.
    // On failure: returns null — no cookie is written.
    login: function (username, password) {
      var user = getUsers().find(function (u) {
        return u.username.toLowerCase() === username.toLowerCase() &&
               u.password === password;
      });
      if (user) {
        setCookie('geolearn_session', user.username, 7); // cookie lasts 7 days
        return user;
      }
      return null;
    },

    // Wipe the session cookie and send the user back to the home page.
    logout: function () {
      deleteCookie('geolearn_session');
      window.location.href = 'index.html';
    },

    // Read the session cookie → look up the matching user object.
    // Returns null when no cookie exists or the user record is missing.
    getCurrentUser: function () {
      var username = getCookie('geolearn_session');
      if (!username) return null;
      return getUsers().find(function (u) {
        return u.username.toLowerCase() === username.toLowerCase();
      }) || null;
    },

    // Quick boolean check — does a valid session cookie exist?
    isLoggedIn: function () {
      return !!getCookie('geolearn_session');
    },

    // ── updateNav ────────────────────────────────────────────────────────────
    // Called automatically on DOMContentLoaded (see bottom of this file).
    // Reads the current session and rebuilds the right side of every nav:
    //   • Logged OUT → adds a "Login" text link inside .nav-links
    //                  + a grey avatar circle with a sign-in dropdown
    //   • Logged IN  → removes the Login link
    //                  + a blue glowing avatar showing initials,
    //                    green status dot, and a "Sign Out" dropdown button
    updateNav: function () {
      var self = this;
      injectCSS(); // ensure avatar styles are present
      var user = self.getCurrentUser();
      var nav = document.querySelector('nav');
      if (!nav) return;

      // Tear down any previously injected avatar so we don't double-up
      var old = nav.querySelector('.geo-av-wrap');
      if (old) old.remove();

      // ── Manage the text "Login" link inside .nav-links ──
      // When logged in:  remove it (avatar replaces the need for it)
      // When logged out: insert it after the Register link
      var navLinks = nav.querySelector('.nav-links');
      if (navLinks) {
        var existingLogin = navLinks.querySelector('a[href="login.html"]');
        if (user && existingLogin) {
          existingLogin.remove();
        } else if (!user && !existingLogin) {
          var loginA = document.createElement('a');
          loginA.href = 'login.html';
          loginA.textContent = 'Login';
          var regLink = navLinks.querySelector('a[href="register.html"]');
          var ctaLink = navLinks.querySelector('a.cta');
          if (regLink && regLink.nextSibling) navLinks.insertBefore(loginA, regLink.nextSibling);
          else if (ctaLink) navLinks.insertBefore(loginA, ctaLink);
          else navLinks.appendChild(loginA);
        }
      }

      // ── Build the avatar circle button ──
      var wrap = document.createElement('div');
      wrap.className = 'geo-av-wrap'; // relative-positioned container for the dropdown

      var btn = document.createElement('div');
      // .on = blue glow (logged in) | .off = grey (logged out)
      btn.className = 'geo-av-btn ' + (user ? 'on' : 'off');
      btn.setAttribute('tabindex', '0');         // keyboard accessible
      btn.setAttribute('aria-label', user ? 'Account menu' : 'Sign in');
      if (user) {
        // Show first + last initials (e.g. "KK" for Kushan Koul)
        var initials = (user.fname.charAt(0) + (user.lname ? user.lname.charAt(0) : '')).toUpperCase();
        btn.textContent = initials;
      } else {
        // Generic person SVG icon when no one is logged in
        btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>';
      }

      // Small coloured dot in the bottom-right corner of the avatar
      // Green + glow = signed in | Grey = signed out
      var dot = document.createElement('span');
      dot.className = 'geo-av-dot ' + (user ? 'on' : 'off');
      btn.appendChild(dot);

      // ── Build the hover dropdown ──
      var dd = document.createElement('div');
      dd.className = 'geo-av-dd'; // revealed on :hover via CSS transition
      if (user) {
        // Logged-in dropdown: full name, @username, reg number, status badge, Sign Out button
        dd.innerHTML =
          '<div class="geo-dd-head">' +
            '<div class="geo-dd-name">' + user.fname + ' ' + user.lname + '</div>' +
            '<div class="geo-dd-uname">@' + user.username + '</div>' +
            (user.regno ? '<div class="geo-dd-uname" style="margin-top:2px;color:#4f8ef7;opacity:0.8;">' + user.regno + '</div>' : '') +
            '<div class="geo-dd-status">' +
              '<span class="geo-dd-sdot on"></span>' +
              '<span style="color:#34d399">Signed in</span>' +
            '</div>' +
          '</div>' +
          '<button class="geo-dd-btn out" id="geo-signout-btn">Sign Out</button>';
      } else {
        // Logged-out dropdown: status + links to Login and Register
        dd.innerHTML =
          '<div class="geo-dd-head">' +
            '<div class="geo-dd-name">Not signed in</div>' +
            '<div class="geo-dd-status">' +
              '<span class="geo-dd-sdot off"></span>' +
              '<span style="color:#8b90a8">Signed out</span>' +
            '</div>' +
          '</div>' +
          '<a href="login.html" class="geo-dd-btn in">Sign In</a>' +
          '<a href="register.html" class="geo-dd-btn reg">Register Free</a>';
      }

      wrap.appendChild(btn);
      wrap.appendChild(dd);
      nav.appendChild(wrap); // attach the whole widget to the end of <nav>

      if (user) {
        var signoutBtn = document.getElementById('geo-signout-btn');
        if (signoutBtn) signoutBtn.addEventListener('click', function () { self.logout(); });
      }
    }
  };

  document.addEventListener('DOMContentLoaded', function () {
    GeoAuth.updateNav();
  });
})();
