const firebaseConfig = {
  apiKey: "AIzaSyC22FVhiAZqvRAln6gcIS1vnpGLSgRO5hg",
  authDomain: "triade-contabilidade.firebaseapp.com",
  databaseURL: "https://triade-contabilidade-default-rtdb.firebaseio.com", // <-- "URL" maiúsculo e sem a barra (/) no final
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
const rtdb = firebase.database();

// 🔴 PERSISTÊNCIA DESATIVADA — evita cache de mensagens deletadas
// db.enablePersistence();