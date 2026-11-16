  if (false) { // ← change to `if (true)` once you have a real Measurement ID
    const gaScript = document.createElement('script');
    gaScript.async = true;
    gaScript.src = 'https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX'; // ← your real ID here too
    document.head.appendChild(gaScript);
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-XXXXXXXXXX', { 'anonymize_ip': true }); // ← and here
    window.trackEvent = function(action, category, label) {
      gtag('event', action, { 'event_category': category, 'event_label': label });
    };
  }
  
