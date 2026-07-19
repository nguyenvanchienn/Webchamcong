import React, { useState, useEffect } from 'react';
import { getAuth, updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { doc, getDoc, updateDoc, collection, addDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import toast from 'react-hot-toast';
import { UserCircle, Lock, Shield, Building2, Image as ImageIcon, Upload, CheckCircle, AlertCircle, Clock as ClockIcon, Loader2, Settings, ChevronDown, ChevronRight, Phone, CreditCard, Camera, Plus } from 'lucide-react';
import Tesseract from 'tesseract.js';

const Profile: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [profileData, setProfileData] = useState<any>(null);

  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  // CCCD Upload states
  const [cccdNumber, setCccdNumber] = useState('');
  const [frontImage, setFrontImage] = useState<File | null>(null);
  const [backImage, setBackImage] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isScanningOCR, setIsScanningOCR] = useState(false);

  // NFC states
  const [cccdMethod, setCccdMethod] = useState<'photo' | 'nfc'>('photo');
  const [isNfcScanning, setIsNfcScanning] = useState(false);

  // Additional OCR fields
  const [idName, setIdName] = useState('');
  const [dob, setDob] = useState('');
  const [gender, setGender] = useState('Nam');
  const [nationality, setNationality] = useState('Việt Nam');
  const [origin, setOrigin] = useState('');
  const [residence, setResidence] = useState('');
  const [issueDate, setIssueDate] = useState('');

  // Contact & Bank states
  const [phone, setPhone] = useState('');
  const [phone2, setPhone2] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankAccountNum, setBankAccountNum] = useState('');
  const [bankAccountName, setBankAccountName] = useState('');
  const [isUpdatingContact, setIsUpdatingContact] = useState(false);
  const [showPhone2, setShowPhone2] = useState(false);

  // UI State
  const [activeTab, setActiveTab] = useState<'profile' | 'settings'>('profile');
  const [isPasswordExpanded, setIsPasswordExpanded] = useState(false);
  const [isCccdExpanded, setIsCccdExpanded] = useState(false);
  const [isContactExpanded, setIsContactExpanded] = useState(false);
  const [isBankExpanded, setIsBankExpanded] = useState(false);
  const [isEditingCccd, setIsEditingCccd] = useState(false);

  const auth = getAuth();
  const user = auth.currentUser;

  const userRole = localStorage.getItem('userRole') || 'EMPLOYEE';
  const employeeId = localStorage.getItem('employeeId');
  const userEmail = localStorage.getItem('userEmail');

  const fetchProfile = async () => {
    setLoading(true);
    try {
      if (employeeId) {
        const empDoc = await getDoc(doc(db, 'employees', employeeId));
        if (empDoc.exists()) {
          const data = empDoc.data();
          setProfileData(data);
          setCccdNumber(data.cccd || '');
          setIdName(data.idName || data.fullName || '');
          setDob(data.dob || '');
          setGender(data.gender || 'Nam');
          setNationality(data.nationality || 'Việt Nam');
          setOrigin(data.origin || '');
          setResidence(data.residence || '');
          setIssueDate(data.issueDate || '');
          setPhone(data.phone || '');
          setPhone2(data.phone2 || '');
          setShowPhone2(!!data.phone2);
          setBankName(data.bankName || '');
          setBankAccountNum(data.bankAccountNum || '');
          setBankAccountName(data.bankAccountName || '');
        }
      }
    } catch (error) {
      console.error("Lỗi lấy thông tin:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, [employeeId]);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error("Mật khẩu xác nhận không khớp!");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("Mật khẩu phải có ít nhất 6 ký tự!");
      return;
    }
    if (!user) {
      toast.error("Không tìm thấy phiên đăng nhập!");
      return;
    }

    setIsUpdating(true);
    try {
      if (user.email) {
        const credential = EmailAuthProvider.credential(user.email, oldPassword);
        await reauthenticateWithCredential(user, credential);
      }
      
      await updatePassword(user, newPassword);
      toast.success("Đổi mật khẩu thành công! Hãy dùng mật khẩu mới cho lần đăng nhập sau.");
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      console.error(error);
      if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password') {
        toast.error("Mật khẩu cũ không chính xác!");
      } else if (error.code === 'auth/requires-recent-login') {
        toast.error("Để bảo mật, vui lòng Đăng xuất và Đăng nhập lại trước khi đổi mật khẩu.");
      } else {
        toast.error("Lỗi khi đổi mật khẩu: " + error.message);
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const handleUpdateContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeeId) return;
    setIsUpdatingContact(true);
    try {
      await updateDoc(doc(db, 'employees', employeeId), {
        phone,
        phone2,
        bankName,
        bankAccountNum,
        bankAccountName
      });
      
      await addDoc(collection(db, 'notifications'), {
        employeeId: employeeId,
        title: 'Cập nhật thông tin liên lạc & thanh toán',
        message: 'Bạn đã thay đổi số điện thoại hoặc thông tin thẻ ngân hàng thành công.',
        type: 'PROFILE_UPDATE',
        read: false,
        createdAt: new Date()
      });
      
      toast.success('Cập nhật thông tin thành công!');
      fetchProfile();
    } catch (err: any) {
      console.error(err);
      toast.error('Lỗi cập nhật: ' + err.message);
    } finally {
      setIsUpdatingContact(false);
    }
  };

  const scanNFC = async () => {
    if (!('NDEFReader' in window)) {
      toast.error("Trình duyệt hoặc thiết bị của bạn không hỗ trợ NFC. Vui lòng chuyển sang tab 'Chụp ảnh'.");
      return;
    }
    
    setIsNfcScanning(true);
    try {
      const ndef = new (window as any).NDEFReader();
      await ndef.scan();
      ndef.onreading = () => {
        toast.error("Đã nhận diện thẻ! Tuy nhiên việc giải mã CCCD (ICAO 9303) trực tiếp qua Web NFC chưa được hỗ trợ hoàn toàn. Vui lòng dùng tính năng Chụp ảnh.");
        setIsNfcScanning(false);
      };
      ndef.onreadingerror = () => {
        toast.error("Không thể đọc thẻ. Vui lòng giữ yên thẻ ở mặt lưng điện thoại.");
        setIsNfcScanning(false);
      };
    } catch (error: any) {
      console.error(error);
      toast.error("Lỗi khởi động NFC: " + error.message);
      setIsNfcScanning(false);
    }
  };

  const handleFrontImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFrontImage(file);
    setIsScanningOCR(true);

    try {
      const result = await Tesseract.recognize(file, 'vie+eng');
      const text = result.data.text;

      const cleanedText = text.replace(/\s+/g, '');
      const match = cleanedText.match(/\d{12}/);
      if (match) setCccdNumber(match[0]);

      // Tìm tên bằng cách quét các dòng in hoa (Tên trên CCCD luôn in hoa toàn bộ)
      let foundName = '';
      const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 5);
      for (const line of lines) {
        // Nếu dòng chỉ chứa chữ in hoa và dấu cách, không chứa số, và không phải các tiêu đề mặc định
        if (/^[A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ\s]+$/.test(line)) {
          if (!line.includes('CỘNG HÒA') && !line.includes('ĐỘC LẬP') && !line.includes('CĂN CƯỚC') && !line.includes('SOCIALIST')) {
            foundName = line;
            setIdName(line);
            break;
          }
        }
      }

      // Fallback cho tên nếu quét theo dòng in hoa thất bại
      if (!foundName) {
        const nameMatch = text.match(/tên[^\n]*\n([A-ZÀ-Ỹ\s]+)/i) || text.match(/name[^\n]*\n([A-ZÀ-Ỹ\s]+)/i);
        if (nameMatch && nameMatch[1].trim().length > 3) setIdName(nameMatch[1].trim());
      }

      const dobMatch = cleanedText.match(/\d{2}\/\d{2}\/\d{4}/);
      if (dobMatch) setDob(dobMatch[0]);

      if (text.toLowerCase().includes('nữ') || text.toLowerCase().includes('nu')) setGender('Nữ');
      else if (text.toLowerCase().includes('nam')) setGender('Nam');

      if (text.toLowerCase().includes('việt nam') || text.toLowerCase().includes('viet nam')) {
        setNationality('Việt Nam');
      }

      const originMatch = text.match(/Quê quán[^\n]*\n(.+)/i) || text.match(/origin[^\n]*\n(.+)/i);
      if (originMatch) setOrigin(originMatch[1].trim());

      const resMatch = text.match(/thường trú[^\n]*\n(.+)/i) || text.match(/residence[^\n]*\n(.+)/i);
      if (resMatch) setResidence(resMatch[1].trim());

    } catch (err) {
      console.error("Lỗi quét OCR:", err);
    } finally {
      setIsScanningOCR(false);
    }
  };

  const handleBackImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setBackImage(file);
    setIsScanningOCR(true);

    try {
      const result = await Tesseract.recognize(file, 'vie+eng');
      const text = result.data.text;

      const dateMatch = text.match(/\d{2}\/\d{2}\/\d{4}/);
      if (dateMatch) setIssueDate(dateMatch[0]);
    } catch (err) {
      console.error("Lỗi quét OCR:", err);
    } finally {
      setIsScanningOCR(false);
    }
  };

  const resizeImageAndConvertToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 800;
          const MAX_HEIGHT = 800;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.6)); // Nén 60% chất lượng để lưu Base64 nhẹ nhất
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    });
  };

  const handleUploadCCCD = async () => {
    if (!frontImage && !profileData?.cccdFrontUrl) {
      toast.error("Vui lòng chọn ảnh Mặt trước CCCD!");
      return;
    }
    if (!backImage && !profileData?.cccdBackUrl) {
      toast.error("Vui lòng chọn ảnh Mặt sau CCCD!");
      return;
    }

    if (!employeeId) return;
    setIsUploading(true);
    try {
      let frontBase64 = profileData?.cccdFrontUrl || '';
      let backBase64 = profileData?.cccdBackUrl || '';

      if (frontImage) {
        frontBase64 = await resizeImageAndConvertToBase64(frontImage);
      }
      if (backImage) {
        backBase64 = await resizeImageAndConvertToBase64(backImage);
      }

      // Update Firestore
      await updateDoc(doc(db, 'employees', employeeId), {
        cccd: cccdNumber,
        idName, dob, gender, nationality, origin, residence, issueDate,
        cccdFrontUrl: frontBase64,
        cccdBackUrl: backBase64,
        cccdStatus: 'PENDING',
        cccdUpdatedAt: new Date().toISOString()
      });

      await addDoc(collection(db, 'notifications'), {
        employeeId: employeeId,
        title: 'Cập nhật Căn cước công dân',
        message: 'Bạn đã tải lên CCCD thành công. Trạng thái hiện tại: Đang chờ duyệt.',
        type: 'PROFILE_UPDATE',
        read: false,
        createdAt: new Date()
      });

      setFrontImage(null);
      setBackImage(null);
      toast.success("Đã tải lên CCCD thành công! Vui lòng chờ Quản lý duyệt.");
      fetchProfile();
    } catch (error) {
      console.error("Lỗi upload CCCD:", error);
      toast.error("Có lỗi khi upload dữ liệu.");
    } finally {
      setIsUploading(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Đang tải hồ sơ...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 h-32 relative">
          <div className="absolute top-4 right-4 flex space-x-2">
            <button 
              onClick={() => setActiveTab('profile')} 
              className={`px-4 py-1.5 rounded-lg flex items-center text-sm font-medium backdrop-blur-sm transition-all ${activeTab === 'profile' ? 'bg-white text-blue-600 shadow-sm' : 'bg-white/20 text-white hover:bg-white/30'}`}
            >
              <UserCircle size={16} className="mr-2" /> Hồ sơ
            </button>
            <button 
              onClick={() => setActiveTab('settings')} 
              className={`px-4 py-1.5 rounded-lg flex items-center text-sm font-medium backdrop-blur-sm transition-all ${activeTab === 'settings' ? 'bg-white text-blue-600 shadow-sm' : 'bg-white/20 text-white hover:bg-white/30'}`}
            >
              <Settings size={16} className="mr-2" /> Cài đặt
            </button>
          </div>
        </div>
        <div className="px-6 sm:px-8 pb-8 relative">
          <div className="-mt-12 mb-4 flex items-end justify-between">
            <div className="h-24 w-24 bg-white rounded-full p-1 shadow-lg flex items-center justify-center text-blue-600">
              <UserCircle size={80} />
            </div>
            <div className="bg-blue-50 px-3 py-1 rounded-full border border-blue-200">
              <span className="text-xs font-bold text-blue-800 uppercase flex items-center">
                <Shield size={14} className="mr-1" /> {userRole}
              </span>
            </div>
          </div>

          <h2 className="text-2xl font-bold text-gray-800">
            {profileData ? profileData.fullName : 'Quản trị viên Hệ thống'}
          </h2>
          <p className="text-gray-500 mt-1">{userEmail}</p>

          <div className="mt-6">
            {activeTab === 'profile' ? (
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-800 border-b pb-4 mb-6">Hồ sơ cá nhân & Công việc</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {profileData && (
                    <>
                      <div className="flex items-center text-gray-600">
                        <UserCircle size={20} className="mr-4 text-indigo-500 flex-shrink-0" />
                        <div>
                          <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Họ và Tên</p>
                          <p className="font-medium text-gray-800 text-lg uppercase">{profileData.idName || profileData.fullName}</p>
                        </div>
                      </div>

                      <div className="flex items-center text-gray-600">
                        <ClockIcon size={20} className="mr-4 text-blue-500 flex-shrink-0" />
                        <div>
                          <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Ngày sinh / Giới tính</p>
                          <p className="font-medium text-gray-800 text-lg">{profileData.dob || '—'} / {profileData.gender || '—'}</p>
                        </div>
                      </div>

                      <div className="flex items-center text-gray-600">
                        <div className="w-5 h-5 mr-4 border-2 border-green-500 text-green-500 rounded flex items-center justify-center text-[10px] font-bold flex-shrink-0">ID</div>
                        <div>
                          <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Căn cước công dân</p>
                          <p className="font-medium text-gray-800 text-lg flex items-center">
                            {profileData.cccd || '—'}
                            {profileData.cccdStatus === 'APPROVED' && <span title="Đã xác thực" className="ml-2 inline-flex"><CheckCircle size={16} className="text-green-500" /></span>}
                            {profileData.cccdStatus === 'PENDING' && <span title="Đang chờ duyệt" className="ml-2 inline-flex"><ClockIcon size={16} className="text-yellow-500" /></span>}
                            {profileData.cccdStatus === 'REJECTED' && <span title="Bị từ chối" className="ml-2 inline-flex"><AlertCircle size={16} className="text-red-500" /></span>}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center text-gray-600">
                        <Phone size={20} className="mr-4 text-green-500 flex-shrink-0" />
                        <div>
                          <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Số điện thoại</p>
                          <p className="font-medium text-gray-800 text-lg">
                            {profileData.phone || '—'}
                            {profileData.phone2 && ` - ${profileData.phone2}`}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center text-gray-600 md:col-span-2">
                        <Building2 size={20} className="mr-4 text-orange-500 flex-shrink-0" />
                        <div>
                          <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Quê quán</p>
                          <p className="font-medium text-gray-800 text-base">{profileData.origin || '—'}</p>
                        </div>
                      </div>

                      <div className="flex items-center text-gray-600 md:col-span-2">
                        <svg className="w-5 h-5 mr-4 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                        <div>
                          <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Nơi thường trú</p>
                          <p className="font-medium text-gray-800 text-base">{profileData.residence || profileData.address || '—'}</p>
                        </div>
                      </div>

                      <div className="flex items-center text-gray-600 md:col-span-2">
                        <CreditCard size={20} className="mr-4 text-purple-500 flex-shrink-0" />
                        <div>
                          <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Tài khoản ngân hàng</p>
                          {profileData.bankAccountNum ? (
                            <>
                              <p className="font-medium text-gray-800 text-lg">{profileData.bankAccountNum} - {profileData.bankName}</p>
                              <p className="text-sm text-gray-600 font-medium uppercase">{profileData.bankAccountName}</p>
                            </>
                          ) : (
                            <p className="font-medium text-gray-800 text-lg">—</p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center text-gray-600">
                        <Building2 size={20} className="mr-4 text-blue-500 flex-shrink-0" />
                        <div>
                          <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Cơ sở làm việc</p>
                          <p className="font-medium text-gray-800 text-lg">{profileData.branchName || '—'}</p>
                        </div>
                      </div>

                      <div className="flex items-center text-gray-600">
                        <div className="w-5 h-5 mr-4 flex items-center justify-center font-bold text-teal-500 text-lg flex-shrink-0">₫</div>
                        <div>
                          <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Lương cơ bản</p>
                          <p className="font-medium text-gray-800 text-lg">
                            {profileData.salaryPerHour ? new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(profileData.salaryPerHour) + ' / giờ' : '—'}
                          </p>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  <button 
                    onClick={() => setIsContactExpanded(!isContactExpanded)}
                    className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center">
                      <Phone size={20} className="mr-3 text-green-600" />
                      <h3 className="text-lg font-semibold text-gray-800">Thông tin liên hệ</h3>
                    </div>
                    {isContactExpanded ? <ChevronDown size={20} className="text-gray-500" /> : <ChevronRight size={20} className="text-gray-500" />}
                  </button>
                  
                  {isContactExpanded && (
                    <div className="p-6 border-t border-gray-200 bg-gray-50">
                      <form onSubmit={handleUpdateContact} className="space-y-4">
                        <div className="grid grid-cols-1 gap-4 max-w-md">
                          <div>
                            <label className="block text-sm text-gray-600 mb-1 font-medium">Số điện thoại {showPhone2 ? '1 (Chính)' : ''}</label>
                            <input 
                              type="text" value={phone} onChange={e => setPhone(e.target.value)}
                              className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:border-green-500 transition-colors"
                            />
                          </div>
                          {showPhone2 ? (
                            <div>
                              <div className="flex justify-between items-end mb-1">
                                <label className="block text-sm text-gray-600 font-medium">Số điện thoại 2 (Phụ)</label>
                                <button type="button" onClick={() => { setShowPhone2(false); setPhone2(''); }} className="text-xs text-red-500 hover:text-red-700">Xóa số phụ</button>
                              </div>
                              <input 
                                type="text" value={phone2} onChange={e => setPhone2(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:border-green-500 transition-colors"
                              />
                            </div>
                          ) : (
                            <div>
                               <button type="button" onClick={() => setShowPhone2(true)} className="text-sm text-green-600 font-medium flex items-center hover:text-green-700">
                                 <Plus size={16} className="mr-1" /> Thêm số phụ
                               </button>
                            </div>
                          )}
                        </div>
                        <button 
                          type="submit" disabled={isUpdatingContact}
                          className={`px-6 py-2 rounded-lg font-medium text-white transition-colors ${
                            isUpdatingContact ? 'bg-green-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'
                          }`}
                        >
                          {isUpdatingContact ? 'Đang lưu...' : 'Lưu thông tin'}
                        </button>
                      </form>
                    </div>
                  )}
                </div>

                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  <button 
                    onClick={() => setIsBankExpanded(!isBankExpanded)}
                    className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center">
                      <CreditCard size={20} className="mr-3 text-purple-600" />
                      <h3 className="text-lg font-semibold text-gray-800">Thông tin ngân hàng</h3>
                    </div>
                    {isBankExpanded ? <ChevronDown size={20} className="text-gray-500" /> : <ChevronRight size={20} className="text-gray-500" />}
                  </button>
                  
                  {isBankExpanded && (
                    <div className="p-6 border-t border-gray-200 bg-gray-50">
                      <form onSubmit={handleUpdateContact} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="md:col-span-2">
                            <label className="block text-sm text-gray-600 mb-1 font-medium">Ngân hàng thụ hưởng</label>
                            <input 
                              type="text" value={bankName} onChange={e => setBankName(e.target.value)}
                              className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:border-purple-500 transition-colors"
                              placeholder="VD: MB Bank, Vietcombank..."
                            />
                          </div>
                          <div>
                            <label className="block text-sm text-gray-600 mb-1 font-medium">Số tài khoản</label>
                            <input 
                              type="text" value={bankAccountNum} onChange={e => setBankAccountNum(e.target.value)}
                              className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:border-purple-500 transition-colors"
                            />
                          </div>
                          <div>
                            <label className="block text-sm text-gray-600 mb-1 font-medium">Tên chủ tài khoản</label>
                            <input 
                              type="text" value={bankAccountName} onChange={e => setBankAccountName(e.target.value)}
                              className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:border-purple-500 transition-colors uppercase"
                              placeholder="NGUYEN VAN A"
                            />
                          </div>
                        </div>
                        <button 
                          type="submit" disabled={isUpdatingContact}
                          className={`px-6 py-2 rounded-lg font-medium text-white transition-colors ${
                            isUpdatingContact ? 'bg-purple-400 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-700'
                          }`}
                        >
                          {isUpdatingContact ? 'Đang lưu...' : 'Lưu ngân hàng'}
                        </button>
                      </form>
                    </div>
                  )}
                </div>

                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  <button 
                    onClick={() => setIsPasswordExpanded(!isPasswordExpanded)}
                    className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center">
                      <Lock size={20} className="mr-3 text-blue-600" />
                      <h3 className="text-lg font-semibold text-gray-800">Đổi mật khẩu</h3>
                    </div>
                    {isPasswordExpanded ? <ChevronDown size={20} className="text-gray-500" /> : <ChevronRight size={20} className="text-gray-500" />}
                  </button>
                  
                  {isPasswordExpanded && (
                    <div className="p-6 border-t border-gray-200 bg-gray-50">
                      <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
                        <div>
                          <label className="block text-sm text-gray-600 mb-1 font-medium">Mật khẩu hiện tại</label>
                          <input 
                            type="password" required
                            value={oldPassword}
                            onChange={e => setOldPassword(e.target.value)}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:border-blue-500 transition-colors"
                            placeholder="Nhập mật khẩu đang dùng"
                          />
                        </div>
                        <div>
                          <label className="block text-sm text-gray-600 mb-1 font-medium">Mật khẩu mới</label>
                          <input 
                            type="password" required minLength={6}
                            value={newPassword}
                            onChange={e => setNewPassword(e.target.value)}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:border-blue-500 transition-colors"
                            placeholder="Ít nhất 6 ký tự"
                          />
                        </div>
                        <div>
                          <label className="block text-sm text-gray-600 mb-1 font-medium">Xác nhận mật khẩu</label>
                          <input 
                            type="password" required minLength={6}
                            value={confirmPassword}
                            onChange={e => setConfirmPassword(e.target.value)}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:border-blue-500 transition-colors"
                            placeholder="Nhập lại mật khẩu"
                          />
                        </div>
                        <button 
                          type="submit" disabled={isUpdating}
                          className={`px-6 py-2 rounded-lg font-medium text-white transition-colors ${
                            isUpdating ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
                          }`}
                        >
                          {isUpdating ? 'Đang cập nhật...' : 'Cập nhật mật khẩu'}
                        </button>
                      </form>
                    </div>
                  )}
                </div>
                
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  <button 
                    onClick={() => setIsCccdExpanded(!isCccdExpanded)}
                    className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center">
                      <ImageIcon size={20} className="mr-3 text-indigo-600" />
                      <h3 className="text-lg font-semibold text-gray-800">Xác thực Căn Cước Công Dân</h3>
                    </div>
                    {isCccdExpanded ? <ChevronDown size={20} className="text-gray-500" /> : <ChevronRight size={20} className="text-gray-500" />}
                  </button>

                  {isCccdExpanded && (
                    <div className="p-6 border-t border-gray-200 bg-gray-50">

                  {profileData?.cccdStatus === 'APPROVED' && (
                    <div className="mb-6 bg-green-50 border border-green-200 p-4 rounded-xl flex items-start">
                      <CheckCircle className="text-green-500 mt-0.5 mr-3 flex-shrink-0" size={20} />
                      <div>
                        <h4 className="font-semibold text-green-800">Đã xác thực thành công</h4>
                        <p className="text-sm text-green-700 mt-1">CCCD của bạn đã được đối chiếu và phê duyệt bởi Quản lý.</p>
                      </div>
                    </div>
                  )}

                  {profileData?.cccdStatus === 'PENDING' && (
                    <div className="mb-6 bg-yellow-50 border border-yellow-200 p-4 rounded-xl flex items-start justify-between">
                      <div className="flex items-start">
                        <ClockIcon className="text-yellow-600 mt-0.5 mr-3 flex-shrink-0" size={20} />
                        <div>
                          <h4 className="font-semibold text-yellow-800">Đang chờ phê duyệt</h4>
                          <p className="text-sm text-yellow-700 mt-1">Hình ảnh CCCD của bạn đang chờ Quản lý kiểm tra.</p>
                        </div>
                      </div>
                      {(profileData?.cccdUpdatedAt || profileData?.updatedAt) && (
                        <div className="text-right flex-shrink-0">
                          <p className="text-xs text-yellow-600 font-medium">Thời gian gửi</p>
                          <p className="text-sm text-yellow-800 font-semibold">{new Date(profileData?.cccdUpdatedAt || profileData?.updatedAt).toLocaleTimeString('vi-VN', {hour: '2-digit', minute:'2-digit'})}</p>
                          <p className="text-xs text-yellow-700">{new Date(profileData?.cccdUpdatedAt || profileData?.updatedAt).toLocaleDateString('vi-VN')}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {profileData?.cccdStatus === 'REJECTED' && (
                    <div className="mb-6 bg-red-50 text-red-700 p-4 rounded-xl border border-red-200 flex items-start">
                      <AlertCircle size={20} className="mr-3 mt-0.5 flex-shrink-0" />
                      <div>
                        <h4 className="font-semibold text-red-800">Bị từ chối xác thực</h4>
                        <p className="text-sm text-red-700 mt-1">Vui lòng chụp rõ nét cả 2 mặt và tải lên lại.</p>
                      </div>
                    </div>
                  )}
                  {(() => {
                    const isCccdReadOnly = profileData?.cccdStatus === 'APPROVED' && !isEditingCccd;
                    const isCccdModified = 
                      cccdNumber !== (profileData?.cccd || '') ||
                      idName !== (profileData?.idName || profileData?.fullName || '') ||
                      dob !== (profileData?.dob || '') ||
                      gender !== (profileData?.gender || 'Nam') ||
                      nationality !== (profileData?.nationality || 'Việt Nam') ||
                      origin !== (profileData?.origin || '') ||
                      residence !== (profileData?.residence || '') ||
                      issueDate !== (profileData?.issueDate || '') ||
                      frontImage !== null ||
                      backImage !== null;
                      
                    const canSubmit = isCccdModified && !isUploading && !isScanningOCR;

                    return (
                      <div className="bg-white border border-gray-200 p-5 rounded-xl">
                        {!isCccdReadOnly && (
                          <div className="flex bg-gray-100 p-1 rounded-lg mb-6 max-w-sm mx-auto">
                            <button
                              type="button"
                              onClick={() => setCccdMethod('photo')}
                              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${cccdMethod === 'photo' ? 'bg-white shadow text-indigo-600' : 'text-gray-600 hover:text-gray-900'}`}
                            >
                              Chụp ảnh
                            </button>
                            <button
                              type="button"
                              onClick={() => setCccdMethod('nfc')}
                              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${cccdMethod === 'nfc' ? 'bg-white shadow text-indigo-600' : 'text-gray-600 hover:text-gray-900'}`}
                            >
                              Quét NFC
                            </button>
                          </div>
                        )}

                        {cccdMethod === 'nfc' && !isCccdReadOnly ? (
                          <div className="text-center py-10 border-2 border-dashed border-indigo-200 rounded-xl bg-indigo-50 mb-6">
                            <div className="bg-white w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm">
                              <CreditCard className={`text-indigo-600 ${isNfcScanning ? 'animate-pulse' : ''}`} size={32} />
                            </div>
                            <h4 className="text-lg font-semibold text-gray-800 mb-2">Đọc thông tin bằng NFC</h4>
                            <p className="text-sm text-gray-600 max-w-md mx-auto mb-6">
                              Vui lòng áp thẻ CCCD gắn chip vào mặt lưng điện thoại (khu vực có chip NFC) và giữ yên.
                            </p>
                            <button 
                              type="button"
                              onClick={scanNFC}
                              className={`px-6 py-2.5 rounded-lg font-medium text-white transition-colors ${isNfcScanning ? 'bg-indigo-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 shadow-md'}`}
                              disabled={isNfcScanning}
                            >
                              {isNfcScanning ? 'Đang chờ đọc thẻ...' : 'Bắt đầu quét NFC'}
                            </button>
                            <p className="text-xs text-gray-500 mt-4 max-w-xs mx-auto">
                              * Lưu ý: Tính năng này yêu cầu thiết bị có hỗ trợ NFC và dùng trình duyệt tương thích (như Chrome Android).
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Số CCCD / CMND</label>
                            <input type="text" disabled={isCccdReadOnly} value={cccdNumber} onChange={e => setCccdNumber(e.target.value)} className={`w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:border-indigo-500 text-sm ${isCccdReadOnly ? 'bg-gray-100' : ''}`} />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Họ và Tên</label>
                            <input type="text" disabled={isCccdReadOnly} value={idName} onChange={e => setIdName(e.target.value)} className={`w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:border-indigo-500 text-sm uppercase ${isCccdReadOnly ? 'bg-gray-100' : ''}`} />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Ngày sinh</label>
                            <input type="text" disabled={isCccdReadOnly} value={dob} onChange={e => setDob(e.target.value)} placeholder="DD/MM/YYYY" className={`w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:border-indigo-500 text-sm ${isCccdReadOnly ? 'bg-gray-100' : ''}`} />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Giới tính</label>
                            <select disabled={isCccdReadOnly} value={gender} onChange={e => setGender(e.target.value)} className={`w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:border-indigo-500 text-sm ${isCccdReadOnly ? 'bg-gray-100' : ''}`}>
                              <option value="Nam">Nam</option>
                              <option value="Nữ">Nữ</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Quốc tịch</label>
                            <input type="text" disabled={isCccdReadOnly} value={nationality} onChange={e => setNationality(e.target.value)} className={`w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:border-indigo-500 text-sm ${isCccdReadOnly ? 'bg-gray-100' : ''}`} />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Ngày cấp (Mặt sau)</label>
                            <input type="text" disabled={isCccdReadOnly} value={issueDate} onChange={e => setIssueDate(e.target.value)} placeholder="DD/MM/YYYY" className={`w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:border-indigo-500 text-sm ${isCccdReadOnly ? 'bg-gray-100' : ''}`} />
                          </div>
                          <div className="md:col-span-2">
                            <label className="block text-xs font-medium text-gray-700 mb-1">Quê quán</label>
                            <input type="text" disabled={isCccdReadOnly} value={origin} onChange={e => setOrigin(e.target.value)} className={`w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:border-indigo-500 text-sm ${isCccdReadOnly ? 'bg-gray-100' : ''}`} />
                          </div>
                          <div className="md:col-span-2">
                            <label className="block text-xs font-medium text-gray-700 mb-1">Nơi thường trú</label>
                            <input type="text" disabled={isCccdReadOnly} value={residence} onChange={e => setResidence(e.target.value)} className={`w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:border-indigo-500 text-sm ${isCccdReadOnly ? 'bg-gray-100' : ''}`} />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Ảnh Mặt Trước</label>
                            <div className={`border-2 border-dashed ${isScanningOCR ? 'border-indigo-400 bg-indigo-50' : 'border-gray-300'} rounded-xl p-2 h-44 flex flex-col items-center justify-center relative overflow-hidden ${isCccdReadOnly ? 'bg-gray-50 opacity-75' : ''}`}>
                              {isScanningOCR ? <Loader2 size={24} className="animate-spin text-indigo-600" /> : frontImage ? (
                                <img src={URL.createObjectURL(frontImage)} className="w-full h-full object-cover rounded-lg" />
                              ) : profileData?.cccdFrontUrl ? (
                                <img src={profileData.cccdFrontUrl} className="w-full h-full object-cover rounded-lg" />
                              ) : (
                                <div className="flex flex-col items-center text-gray-400 mb-6">
                                  <Upload size={32} className="mb-2 opacity-50" />
                                  <span className="text-xs font-medium">Chưa có ảnh</span>
                                </div>
                              )}

                              {!isCccdReadOnly && !isScanningOCR && (
                                <div className={`absolute ${frontImage || profileData?.cccdFrontUrl ? 'bottom-2' : 'bottom-6'} flex justify-center space-x-2`}>
                                  <label className="cursor-pointer bg-white px-3 py-1.5 border border-gray-300 rounded-lg shadow-sm text-xs font-medium text-gray-700 hover:bg-gray-50 flex items-center">
                                    <Upload size={14} className="mr-1.5" /> Tải lên
                                    <input type="file" accept="image/*" onChange={handleFrontImageChange} className="hidden" />
                                  </label>
                                  <label className="cursor-pointer bg-indigo-50 px-3 py-1.5 border border-indigo-200 rounded-lg shadow-sm text-xs font-medium text-indigo-700 hover:bg-indigo-100 flex items-center">
                                    <Camera size={14} className="mr-1.5" /> Chụp ảnh
                                    <input type="file" accept="image/*" capture="environment" onChange={handleFrontImageChange} className="hidden" />
                                  </label>
                                </div>
                              )}
                            </div>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Ảnh Mặt Sau</label>
                            <div className={`border-2 border-dashed border-gray-300 rounded-xl p-2 h-44 flex flex-col items-center justify-center relative overflow-hidden ${isCccdReadOnly ? 'bg-gray-50 opacity-75' : ''}`}>
                              {isScanningOCR ? <Loader2 size={24} className="animate-spin text-indigo-600" /> : backImage ? (
                                <img src={URL.createObjectURL(backImage)} className="w-full h-full object-cover rounded-lg" />
                              ) : profileData?.cccdBackUrl ? (
                                <img src={profileData.cccdBackUrl} className="w-full h-full object-cover rounded-lg" />
                              ) : (
                                <div className="flex flex-col items-center text-gray-400 mb-6">
                                  <Upload size={32} className="mb-2 opacity-50" />
                                  <span className="text-xs font-medium">Chưa có ảnh</span>
                                </div>
                              )}

                              {!isCccdReadOnly && !isScanningOCR && (
                                <div className={`absolute ${backImage || profileData?.cccdBackUrl ? 'bottom-2' : 'bottom-6'} flex justify-center space-x-2`}>
                                  <label className="cursor-pointer bg-white px-3 py-1.5 border border-gray-300 rounded-lg shadow-sm text-xs font-medium text-gray-700 hover:bg-gray-50 flex items-center">
                                    <Upload size={14} className="mr-1.5" /> Tải lên
                                    <input type="file" accept="image/*" onChange={handleBackImageChange} className="hidden" />
                                  </label>
                                  <label className="cursor-pointer bg-indigo-50 px-3 py-1.5 border border-indigo-200 rounded-lg shadow-sm text-xs font-medium text-indigo-700 hover:bg-indigo-100 flex items-center">
                                    <Camera size={14} className="mr-1.5" /> Chụp ảnh
                                    <input type="file" accept="image/*" capture="environment" onChange={handleBackImageChange} className="hidden" />
                                  </label>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="mt-6 flex justify-end space-x-3">
                          {isCccdReadOnly ? (
                            <button
                              type="button"
                              onClick={() => setIsEditingCccd(true)}
                              className="px-6 py-2 rounded-lg font-medium text-indigo-600 border border-indigo-600 hover:bg-indigo-50 transition-colors"
                            >
                              Chỉnh sửa
                            </button>
                          ) : (
                            <>
                              {!isCccdReadOnly && profileData?.cccdStatus === 'APPROVED' && (
                                <button type="button" onClick={() => setIsEditingCccd(false)} className="px-6 py-2 rounded-lg font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors">
                                  Hủy
                                </button>
                              )}
                              <button
                                onClick={handleUploadCCCD}
                                disabled={!canSubmit || profileData?.cccdStatus === 'APPROVED'}
                                className={`px-6 py-2 rounded-lg font-medium text-white transition-colors ${!canSubmit ? 'bg-indigo-300 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'}`}
                              >
                                {isUploading ? 'Đang tải lên...' : (profileData?.cccdStatus === 'PENDING' && !isCccdModified ? 'Đã gửi yêu cầu' : 'Gửi Yêu Cầu Xác Thực')}
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                    </div>
                  );
                  })()}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  </div>
</div>
  );
};

export default Profile;
