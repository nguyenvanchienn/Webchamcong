import { initializeApp, cert, ServiceAccount } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getMessaging } from 'firebase-admin/messaging';
import { getStorage } from 'firebase-admin/storage';
import { getFirestore } from 'firebase-admin/firestore';

import serviceAccount from '../../serviceAccountKey.json';

const app = initializeApp({
  credential: cert(serviceAccount as ServiceAccount),
  storageBucket: 'chamcong-c13e6.firebasestorage.app'
});

export const auth = getAuth(app);
export const messaging = getMessaging(app);
export const storage = getStorage(app);
export const bucket = storage.bucket();
export const db = getFirestore(app);

console.log('✅ Đã khởi tạo thành công Firebase Admin SDK (Firestore, Auth, Storage, FCM).');
