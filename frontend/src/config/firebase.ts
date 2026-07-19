import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyD0eXMpMJd_oxvf22AMe0StNTqebcaFsZY",
  authDomain: "chamcong-c13e6.firebaseapp.com",
  projectId: "chamcong-c13e6",
  storageBucket: "chamcong-c13e6.firebasestorage.app",
  messagingSenderId: "25438199659",
  appId: "1:25438199659:web:2963ac261f0cf2c5ed762e",
  measurementId: "G-9P36W4WZ8E"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
