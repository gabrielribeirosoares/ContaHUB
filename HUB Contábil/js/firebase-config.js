const firebaseConfig = {
  apiKey: "AIzaSyC22FVhiAZqvRAln6gcIS1vnpGLSgRO5hg",
  authDomain: "triade-contabilidade.firebaseapp.com",
  projectId: "triade-contabilidade",
  storageBucket: "triade-contabilidade.firebasestorage.app",
  messagingSenderId: "45393904968",
  appId: "1:45393904968:web:8eb94dd149a33c1705df7d",
  measurementId: "G-EBWMVG8DVE"
};

firebase.initializeApp(firebaseConfig);
    const auth = firebase.auth();
    const db = firebase.firestore();
    const storage = firebase.storage();

    // 🔴 ATIVAR O MODO OFFLINE (PERSISTÊNCIA)
    db.enablePersistence()
      .catch(function(err) {
          if (err.code == 'failed-precondition') {
              console.warn('O modo offline só funciona num separador de cada vez.');
          } else if (err.code == 'unimplemented') {
              console.warn('O seu navegador não suporta o modo offline.');
          }
      });
  