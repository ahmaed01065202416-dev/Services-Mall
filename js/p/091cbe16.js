  // Same Firebase project as main site
  if (!window._firebaseInitialized) {
    firebase.initializeApp({
      apiKey:       "AIzaSyDfWKWN5CTlBA-krEMXsmYmaI8j7fyuw20",
      authDomain:   "services-mall.firebaseapp.com",
      projectId:    "services-mall",
      storageBucket:"services-mall.firebasestorage.app",
    });
    window.db  = firebase.firestore();
    window._firebaseInitialized = true;
  }
