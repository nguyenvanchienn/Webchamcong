import express from 'express';
import { auth, db } from '../config/firebase-admin';

const router = express.Router();

// Tạo mới tài khoản (Chỉ gọi được bởi Super Admin)
router.post('/create', async (req, res) => {
  const { email, password, role, employeeId, branchId } = req.body;

  try {
    // 1. Tạo user trên Firebase Auth
    const userRecord = await auth.createUser({
      email,
      password,
    });

    // 2. Gán Custom Claim để phân quyền
    await auth.setCustomUserClaims(userRecord.uid, { role });

    // 3. Lưu thông tin phụ vào Firestore collection 'users'
    await db.collection('users').doc(userRecord.uid).set({
      email,
      role,
      employeeId: employeeId || null,
      branchId: branchId || null,
      status: 'ACTIVE',
      createdAt: new Date()
    });

    res.status(201).json({ 
      message: 'Tạo tài khoản thành công', 
      uid: userRecord.uid 
    });
  } catch (error: any) {
    console.error('Lỗi tạo user:', error);
    res.status(400).json({ message: error.message || 'Lỗi khi tạo tài khoản' });
  }
});

// Xóa tài khoản
router.delete('/:uid', async (req, res) => {
  const { uid } = req.params;
  try {
    await auth.deleteUser(uid);
    await db.collection('users').doc(uid).delete();
    res.json({ message: 'Xóa tài khoản thành công' });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

export default router;
