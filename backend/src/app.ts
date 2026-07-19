import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import './config/firebase-admin'; // Initialize Firebase Admin
import userRoutes from './routes/userRoutes';

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/users', userRoutes);

app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', message: 'Hệ thống API (Firebase Admin) đang hoạt động' });
});

const PORT = process.env.PORT || 5000;

import { auth, db } from './config/firebase-admin';

const seedFirebaseAdmin = async () => {
  try {
    const adminEmail = 'admin@chamcong.com';
    const adminPass = 'admin123';
    
    // Check if user exists
    let userRecord;
    try {
      userRecord = await auth.getUserByEmail(adminEmail);
      console.log('✅ Tài khoản Admin đã tồn tại trên Firebase.');
    } catch (error: any) {
      if (error.code === 'auth/user-not-found') {
        userRecord = await auth.createUser({
          email: adminEmail,
          password: adminPass,
          displayName: 'Super Admin',
        });
        console.log(`✅ Đã tạo tài khoản Firebase Admin: ${adminEmail} / ${adminPass}`);
        
        // Cấp quyền Custom Claim
        await auth.setCustomUserClaims(userRecord.uid, { role: 'SUPER_ADMIN' });
        
        // Lưu thông tin vào Firestore
        await db.collection('users').doc(userRecord.uid).set({
          email: adminEmail,
          role: 'SUPER_ADMIN',
          status: 'ACTIVE',
          createdAt: new Date()
        });
      } else {
        throw error;
      }
    }
  } catch (err) {
    console.error('❌ Lỗi tạo Admin:', err);
  }
};

const startServer = async () => {
  await seedFirebaseAdmin();
  app.listen(PORT, () => {
    console.log(`🚀 Server đang chạy tại cổng ${PORT}`);
  });
};

startServer();
