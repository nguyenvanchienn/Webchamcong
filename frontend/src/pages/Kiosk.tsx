import React, { useState, useEffect } from "react";
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  doc,
  updateDoc,
  onSnapshot,
  arrayUnion,
  deleteField,
  getDoc,
} from "firebase/firestore";
import { db } from "../config/firebase";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Clock, CheckCircle, Search, User } from "lucide-react";
import { auth } from "../config/firebase";
import { onAuthStateChanged } from "firebase/auth";

interface Employee {
  id: string;
  fullName: string;
  employeeCode?: string;
  branchName: string;
  salaryPerHour?: number;
}

interface Attendance {
  id: string;
  employeeId: string;
  date: string;
  checkIn: Date | null;
  checkOut: Date | null;
  logs?: { action: string; time: Date; note?: string }[];
}

const calculateHoursWorked = (data: any): number => {
  if (!data.checkIn) return 0;
  if (data.logs && data.logs.length > 0) {
    let totalMs = 0;
    let lastIn: Date | null = null;
    for (const log of data.logs) {
      if (log.action === "CHECK_IN") {
        lastIn = log.time?.toDate ? log.time.toDate() : new Date(log.time);
      } else if (log.action === "CHECK_OUT" && lastIn) {
        const outTime = log.time?.toDate
          ? log.time.toDate()
          : new Date(log.time);
        totalMs += outTime.getTime() - lastIn.getTime();
        lastIn = null;
      }
    }
    if (lastIn && !data.checkOut) {
      totalMs += Date.now() - lastIn.getTime();
    }
    return totalMs / (1000 * 60 * 60);
  }
  const inTime = data.checkIn?.toDate
    ? data.checkIn.toDate()
    : new Date(data.checkIn);
  if (!data.checkOut) {
    return Math.max(0, Date.now() - inTime.getTime()) / (1000 * 60 * 60);
  }
  const outTime = data.checkOut?.toDate
    ? data.checkOut.toDate()
    : new Date(data.checkOut);
  return Math.max(0, outTime.getTime() - inTime.getTime()) / (1000 * 60 * 60);
};

const Kiosk: React.FC = () => {
  const navigate = useNavigate();
  const branchId = localStorage.getItem("branchId");
  const userRole = localStorage.getItem("userRole");

  const [currentTime, setCurrentTime] = useState(new Date());
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedEmp, setSelectedEmp] = useState<Employee | null>(null);
  const [todayAttendance, setTodayAttendance] = useState<Attendance | null>(
    null,
  );
  const [todayShifts, setTodayShifts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [checkoutSuccess, setCheckoutSuccess] = useState(false);

  const [storeName, setStoreName] = useState<string>(localStorage.getItem('storeName') || 'Hệ Thống Điểm Danh Tự Động');
  const [storeNameColor, setStoreNameColor] = useState<string>(localStorage.getItem('storeNameColor') || '#1f2937');
  const [storeNameFont, setStoreNameFont] = useState<string>(localStorage.getItem('storeNameFont') || 'system-ui, sans-serif');
  const [storeLogo, setStoreLogo] = useState<string>(localStorage.getItem('storeLogo') || '');

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const docSnap = await getDoc(doc(db, "settings", "general"));
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.storeName) { setStoreName(data.storeName); localStorage.setItem('storeName', data.storeName); }
          if (data.storeNameColor) { setStoreNameColor(data.storeNameColor); localStorage.setItem('storeNameColor', data.storeNameColor); }
          if (data.storeNameFont) { setStoreNameFont(data.storeNameFont); localStorage.setItem('storeNameFont', data.storeNameFont); }
          if (data.storeLogo) { setStoreLogo(data.storeLogo); localStorage.setItem('storeLogo', data.storeLogo); }
        }
      } catch (e) {
        console.error(e);
      }
    };
    fetchSettings();

    const handleBrandingUpdate = () => {
      setStoreName(localStorage.getItem('storeName') || 'Hệ Thống Điểm Danh Tự Động');
      setStoreNameColor(localStorage.getItem('storeNameColor') || '#1f2937');
      setStoreNameFont(localStorage.getItem('storeNameFont') || 'system-ui, sans-serif');
      setStoreLogo(localStorage.getItem('storeLogo') || '');
    };

    window.addEventListener('brandingUpdated', handleBrandingUpdate);

    return () => {
      window.removeEventListener('brandingUpdated', handleBrandingUpdate);
    };
  }, []);

  // Lắng nghe lệnh đăng xuất từ xa
  useEffect(() => {
    let unsubSnapshot: (() => void) | undefined;

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        unsubSnapshot = onSnapshot(
          doc(db, "users", user.uid),
          async (docSnap) => {
            if (docSnap.exists() && docSnap.data().forceLogout) {
              await updateDoc(docSnap.ref, { forceLogout: false });
              await auth.signOut();
              localStorage.clear();
              navigate("/login");
            }
          },
        );
      } else {
        if (unsubSnapshot) unsubSnapshot();
      }
    });

    return () => {
      unsubAuth();
      if (unsubSnapshot) unsubSnapshot();
    };
  }, [navigate]);

  // Cập nhật đồng hồ
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Lấy danh sách nhân viên của cơ sở này
  useEffect(() => {
    if (userRole !== "KIOSK" && userRole !== "SUPER_ADMIN") {
      navigate("/dashboard");
      return;
    }

    const fetchEmployees = async () => {
      try {
        let q = collection(db, "employees");
        if (branchId) {
          q = query(
            collection(db, "employees"),
            where("branchId", "==", branchId),
          ) as any;
        }
        const snap = await getDocs(q);
        const list: Employee[] = [];
        snap.forEach((d) => {
          if (d.data().status === "ACTIVE") {
            list.push({ id: d.id, ...d.data() } as Employee);
          }
        });
        setEmployees(list);
      } catch (err) {
        console.error(err);
        toast.error("Lỗi khi tải danh sách nhân viên");
      }
    };

    fetchEmployees();
  }, [branchId, userRole, navigate]);

  // Kiểm tra trạng thái chấm công của nhân viên được chọn
  useEffect(() => {
    const checkStatus = async () => {
      if (!selectedEmp) {
        setTodayAttendance(null);
        return;
      }
      setLoading(true);
      try {
        const pastDate = new Date();
        pastDate.setDate(pastDate.getDate() - 14); // Quét 14 ngày gần nhất để chắc chắn bao gồm cả trường hợp 1 tuần
        const pastDateStr = pastDate.toLocaleDateString("en-CA");
        const todayStr = new Date().toLocaleDateString("en-CA");

        const q = query(
          collection(db, "attendance"),
          where("employeeId", "==", selectedEmp.id)
        );
        const snap = await getDocs(q);
        
        if (!snap.empty) {
          const records = snap.docs
            .map((d) => ({ id: d.id, data: d.data() }))
            .filter((r) => r.data.date >= pastDateStr);
          records.sort((a, b) => {
            const timeA = a.data.checkIn?.toMillis
              ? a.data.checkIn.toMillis()
              : a.data.checkIn
                ? new Date(a.data.checkIn).getTime()
                : 0;
            const timeB = b.data.checkIn?.toMillis
              ? b.data.checkIn.toMillis()
              : b.data.checkIn
                ? new Date(b.data.checkIn).getTime()
                : 0;
            return timeB - timeA;
          });

          // Tìm ca đang làm (chưa checkout)
          let activeRecord = null;
          for (const r of records) {
            if (!r.data.checkOut) {
              activeRecord = r;
              break;
            }
          }
          
          // Ưu tiên hiển thị ca đang làm, nếu không thì lấy ca mới nhất của hôm nay
          const targetRecord = activeRecord || records.find(r => r.data.date === todayStr);

          if (targetRecord) {
            const data = targetRecord.data;
            setTodayAttendance({
              id: targetRecord.id,
              employeeId: data.employeeId,
              date: data.date,
              checkIn: data.checkIn?.toDate
                ? data.checkIn.toDate()
                : data.checkIn
                  ? new Date(data.checkIn)
                  : null,
              checkOut: data.checkOut?.toDate
                ? data.checkOut.toDate()
                : data.checkOut
                  ? new Date(data.checkOut)
                  : null,
              logs:
                data.logs?.map((l: any) => ({
                  action: l.action,
                  time: l.time?.toDate ? l.time.toDate() : new Date(l.time),
                })) || [],
            });
          } else {
            setTodayAttendance(null);
          }
        } else {
          setTodayAttendance(null);
        }

        // Fetch Shifts
        const schedQ = query(
          collection(db, "schedules"),
          where("employeeId", "==", selectedEmp.id),
          where("date", "==", todayStr),
        );
        const schedSnap = await getDocs(schedQ);
        setTodayShifts(schedSnap.docs.map((d) => d.data()));
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    checkStatus();
  }, [selectedEmp]);

  const handleAction = async () => {
    if (!selectedEmp) return;
    setLoading(true);
    try {
      const todayStr = new Date().toLocaleDateString("en-CA");

      if (!todayAttendance) {
        let maxMultiplier = 1;
        todayShifts.forEach((s) => {
          if (s.salaryMultiplier && s.salaryMultiplier > maxMultiplier) {
            maxMultiplier = s.salaryMultiplier;
          }
        });
        const finalSalary = (selectedEmp.salaryPerHour || 0) * maxMultiplier;
        const checkInTime = new Date();

        const docRef = await addDoc(collection(db, "attendance"), {
          employeeId: selectedEmp.id,
          employeeName: selectedEmp.fullName,
          branchName: selectedEmp.branchName,
          branchId: branchId || null,
          date: todayStr,
          checkIn: checkInTime,
          checkOut: null,
          status: "PRESENT",
          salaryPerHour: finalSalary,
          logs: [{ action: "CHECK_IN", time: checkInTime }],
        });
        setTodayAttendance({
          id: docRef.id,
          employeeId: selectedEmp.id,
          date: todayStr,
          checkIn: checkInTime,
          checkOut: null,
          logs: [{ action: "CHECK_IN", time: checkInTime }],
        });
        toast.success(`Check-in thành công cho ${selectedEmp.fullName}`);
      } else if (todayAttendance && !todayAttendance.checkOut) {
        // Kiểm tra xem nhân viên này có đang giữ ca (chưa chốt ca) không
        if (branchId) {
          const shiftQ = query(
            collection(db, "shift_reports"),
            where("branchId", "==", branchId),
            where("status", "==", "OPEN"),
          );
          const shiftSnap = await getDocs(shiftQ);
          if (!shiftSnap.empty) {
            const openShifts = shiftSnap.docs.map((d) => d.data());
            const code = selectedEmp.employeeCode || selectedEmp.id;
            const isHoldingShift = openShifts.some((shift) => {
              const cName = shift.cashierName || shift.cashierEmail || "";
              return (
                cName.includes(code) ||
                (selectedEmp.fullName && cName.includes(selectedEmp.fullName))
              );
            });
            if (isHoldingShift) {
              toast.error(
                "Bạn CHƯA BÀN GIAO CA (Chốt ca)! Vui lòng chốt ca trên máy tính tiền trước khi check-out.",
                {
                  duration: 6000,
                  style: {
                    border: "1px solid #ef4444",
                    padding: "16px",
                    color: "#b91c1c",
                  },
                },
              );
              setLoading(false);
              return;
            }
          }
        }

        // Đã check in => Check Out
        const checkOutTime = new Date();
        const newLog = { action: "CHECK_OUT", time: checkOutTime };
        await updateDoc(doc(db, "attendance", todayAttendance.id), {
          checkOut: checkOutTime,
          logs: arrayUnion(newLog),
        });

        const updatedLogs = [...(todayAttendance.logs || []), newLog];
        setTodayAttendance({
          ...todayAttendance,
          checkOut: checkOutTime,
          logs: updatedLogs,
        });

        try {
          // Tính thu nhập tạm tính (old balance + shift earned)
          const attQ = query(
            collection(db, "attendance"),
            where("employeeId", "==", selectedEmp.id),
            where("isPaid", "==", false),
          );
          const attSnap = await getDocs(attQ);

          let oldBalance = 0;
          let shiftEarned = 0;

          // Calculate for the exact last interval in this shift
          let lastInTime: Date | null = null;
          if (todayAttendance.logs && todayAttendance.logs.length > 0) {
            const inLogs = todayAttendance.logs.filter(
              (l: any) => l.action === "CHECK_IN",
            );
            if (inLogs.length > 0) {
              lastInTime = inLogs[inLogs.length - 1].time;
            }
          }
          if (!lastInTime) lastInTime = todayAttendance.checkIn;
          if (lastInTime) {
            const durationMs = checkOutTime.getTime() - lastInTime.getTime();
            shiftEarned =
              (durationMs / 3600000) * (selectedEmp.salaryPerHour || 0);
          }

          attSnap.forEach((d) => {
            if (d.id !== todayAttendance.id) {
              const hours = calculateHoursWorked(d.data());
              oldBalance += hours * (selectedEmp.salaryPerHour || 0);
            } else {
              // The old balance of THIS shift (if they checked out, then checked in again)
              const beforeThisCheckoutData = {
                checkIn: todayAttendance.checkIn,
                checkOut: null,
                logs: todayAttendance.logs || [],
              };
              const beforeHours = calculateHoursWorked(beforeThisCheckoutData);
              oldBalance += beforeHours * (selectedEmp.salaryPerHour || 0);
            }
          });

          // Fetch unpaid bonuses
          const bonusQ = query(
            collection(db, "bonuses"),
            where("employeeId", "==", selectedEmp.id),
            where("isPaid", "==", false),
          );
          const bonusSnap = await getDocs(bonusQ);
          bonusSnap.forEach((d) => {
            const val = d.data().amount || 0;
            if (d.data().type === "DEDUCT") oldBalance -= val;
            else oldBalance += val;
          });

          const newBalance = oldBalance + shiftEarned;

          const formatMoney = (val: number) =>
            new Intl.NumberFormat("vi-VN", {
              style: "currency",
              currency: "VND",
            }).format(val);

          await addDoc(collection(db, "notifications"), {
            employeeId: selectedEmp.id,
            title: "Thu nhập ca làm việc",
            message: `Số dư của bạn đã tăng +${formatMoney(shiftEarned)} cho ca làm hiện tại.\nSố dư cũ: ${formatMoney(oldBalance)}\nSố dư hiện tại (Thu nhập tạm tính): ${formatMoney(newBalance)}`,
            type: "MONEY_ADD",
            read: false,
            createdAt: new Date(),
          });
        } catch (e) {
          console.error("Lỗi tính tiền:", e);
        }

        toast.success(`Check-out thành công cho ${selectedEmp.fullName}`);
        setCheckoutSuccess(true);
      } else if (todayAttendance && todayAttendance.checkOut) {
        // Check in lại
        const checkInTime = new Date();
        const nowM = checkInTime.getHours() * 60 + checkInTime.getMinutes();

        let isSameShift = false;
        if (todayShifts && todayShifts.length > 0) {
          for (const s of todayShifts) {
            const matchStart = s.shift.match(/\((\d{2}):(\d{2})/);
            const matchEnd = s.shift.match(/-\s*(\d{2}):(\d{2})/);
            if (matchStart && matchEnd) {
              const startM =
                parseInt(matchStart[1]) * 60 + parseInt(matchStart[2]);
              let endM = parseInt(matchEnd[1]) * 60 + parseInt(matchEnd[2]);
              if (endM < startM) endM += 24 * 60;

              if (nowM >= startM - 60 && nowM <= endM + 120) {
                if (todayAttendance.checkIn) {
                  const prevInM =
                    todayAttendance.checkIn.getHours() * 60 +
                    todayAttendance.checkIn.getMinutes();
                  if (prevInM >= startM - 60 && prevInM <= endM + 120) {
                    isSameShift = true;
                    break;
                  }
                }
              }
            }
          }
        }

        if (isSameShift) {
          const newLog = { action: "CHECK_IN", time: checkInTime };
          await updateDoc(doc(db, "attendance", todayAttendance.id), {
            checkOut: deleteField(),
            logs: arrayUnion(newLog),
          });
          setTodayAttendance({
            ...todayAttendance,
            checkOut: null,
            logs: [...(todayAttendance.logs || []), newLog],
          });
          toast.success(
            `Tiếp tục ca làm thành công cho ${selectedEmp.fullName}`,
          );
        } else {
          let maxMultiplier = 1;
          todayShifts.forEach((s) => {
            if (s.salaryMultiplier && s.salaryMultiplier > maxMultiplier) {
              maxMultiplier = s.salaryMultiplier;
            }
          });
          const finalSalary = (selectedEmp.salaryPerHour || 0) * maxMultiplier;

          const docRef = await addDoc(collection(db, "attendance"), {
            employeeId: selectedEmp.id,
            employeeName: selectedEmp.fullName,
            branchName: selectedEmp.branchName,
            branchId: branchId || null,
            date: todayStr,
            checkIn: checkInTime,
            checkOut: null,
            status: "PRESENT",
            salaryPerHour: finalSalary,
            logs: [{ action: "CHECK_IN", time: checkInTime }],
          });
          setTodayAttendance({
            id: docRef.id,
            employeeId: selectedEmp.id,
            date: todayStr,
            checkIn: checkInTime,
            checkOut: null,
            logs: [{ action: "CHECK_IN", time: checkInTime }],
          });
          toast.success(
            `Check-in ca mới thành công cho ${selectedEmp.fullName}`,
          );
        }
      }

      // Bỏ tự động thoát ra để nhân viên có thể xem đồng hồ bấm giờ
      // setTimeout(() => { ... }, 3000);
    } catch (err) {
      console.error(err);
      toast.error("Có lỗi xảy ra!");
    } finally {
      setLoading(false);
    }
  };

  const filteredEmployees = employees.filter(
    (e) =>
      e.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (e.employeeCode && e.employeeCode.includes(searchTerm)),
  );

  return (
    <div className="min-h-screen bg-blue-50 flex flex-col">
      {/* Header */}
      <header className="bg-white shadow-sm p-3 md:p-4 flex justify-center sm:justify-start items-center">
        <div className="flex items-center gap-3">
          {storeLogo ? (
            <img src={storeLogo} alt="Logo" className="hidden sm:block w-10 h-10 object-contain rounded-md" />
          ) : (
            <div className="bg-blue-600 text-white p-2 rounded-lg hidden sm:block">
              <CheckCircle size={24} />
            </div>
          )}
          <div className="text-center sm:text-left">
            <h1 className="text-lg md:text-xl font-bold" style={{ color: storeNameColor, fontFamily: storeNameFont }}>
              {storeName}
            </h1>
            <p className="text-xs md:text-sm text-gray-500">
              Thiết bị điểm danh dùng chung
            </p>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center p-4">
        {/* Đồng hồ */}
        <div className="text-center mb-8 md:mb-12">
          <div className="text-5xl sm:text-6xl md:text-7xl font-mono font-bold text-blue-900 drop-shadow-sm flex flex-col sm:flex-row items-center justify-center gap-2 md:gap-4">
            <Clock className="text-blue-500 w-12 h-12 md:w-16 md:h-16 hidden sm:block" />
            {currentTime.toLocaleTimeString("vi-VN", { hour12: false })}
          </div>
          <div className="text-sm sm:text-lg md:text-2xl text-gray-600 mt-2 md:mt-4 font-medium uppercase tracking-wide px-2">
            {currentTime.toLocaleDateString("vi-VN", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </div>
        </div>

        {/* Khung điểm danh */}
        <div className="bg-white w-full max-w-xl rounded-2xl shadow-xl overflow-hidden border border-gray-100 transition-all duration-300">
          {!selectedEmp ? (
            <div className="p-8">
              <h2 className="text-2xl font-bold text-gray-800 text-center mb-6">
                Bạn là ai?
              </h2>

              <div className="relative mb-6">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Search className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="text"
                  placeholder="Nhập tên hoặc Mã số để tìm..."
                  className="w-full pl-11 pr-4 py-4 text-lg border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-4 focus:ring-blue-100 outline-none transition-all"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  autoComplete="off"
                />
              </div>

              <div className="max-h-64 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                {filteredEmployees.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    Không tìm thấy nhân viên nào
                  </div>
                ) : (
                  filteredEmployees.map((emp) => (
                    <button
                      key={emp.id}
                      onClick={() => setSelectedEmp(emp)}
                      className="w-full flex items-center p-4 bg-gray-50 hover:bg-blue-50 border border-gray-100 rounded-xl transition-colors text-left"
                    >
                      <div className="bg-blue-100 text-blue-600 p-3 rounded-full mr-4">
                        <User size={24} />
                      </div>
                      <div>
                        <div className="font-bold text-gray-800 text-lg">
                          {emp.fullName}
                        </div>
                        <div className="text-sm text-gray-500 font-mono">
                          ID: {emp.employeeCode || emp.id.substring(0, 6)}
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="p-8 text-center">
              <button
                onClick={() => {
                  setSelectedEmp(null);
                  setSearchTerm("");
                  setCheckoutSuccess(false);
                }}
                className="text-blue-500 hover:text-blue-700 font-medium text-sm mb-6 inline-flex items-center"
              >
                ← Quay lại danh sách
              </button>

              <div className="w-24 h-24 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <User size={48} />
              </div>
              <h2 className="text-3xl font-bold text-gray-800 mb-2">
                {selectedEmp.fullName}
              </h2>
              <p className="text-gray-500 font-mono mb-8">
                ID: {selectedEmp.employeeCode || selectedEmp.id.substring(0, 6)}
              </p>

              {loading ? (
                <div className="py-4 text-gray-500 font-medium">
                  Đang kiểm tra dữ liệu...
                </div>
              ) : (
                <div className="space-y-4">
                  {(() => {
                    let activeShiftName = null;
                    if (todayShifts.length > 0) {
                      const now = new Date();
                      const currentMinutes =
                        now.getHours() * 60 + now.getMinutes();
                      let minDiff = Infinity;
                      for (const s of todayShifts) {
                        if (!s.shift) continue;
                        const match = s.shift.match(/\(([\d:]+)\s*-/);
                        if (match) {
                          const [h, m] = match[1].split(":").map(Number);
                          const startMinutes = h * 60 + m;
                          const diff = Math.abs(currentMinutes - startMinutes);
                          if (diff < minDiff) {
                            minDiff = diff;
                            activeShiftName = s.shift;
                          }
                        }
                      }
                      if (!activeShiftName && todayShifts[0])
                        activeShiftName = todayShifts[0].shift;
                    }

                    return activeShiftName ? (
                      <div className="bg-blue-50 border border-blue-100 text-blue-800 px-4 py-3 rounded-xl flex items-center justify-center gap-2 font-medium mb-2">
                        <Clock size={20} className="text-blue-600" />
                        <span>
                          Ca của bạn:{" "}
                          <strong className="text-blue-900">
                            {activeShiftName}
                          </strong>
                        </span>
                      </div>
                    ) : null;
                  })()}

                  {!todayAttendance?.checkIn
                    ? (() => {
                        let canCheckIn = false;
                        if (todayShifts.length > 0) {
                          const now = new Date();
                          const currentMinutes =
                            now.getHours() * 60 + now.getMinutes();
                          for (const s of todayShifts) {
                            if (!s.shift) continue;
                            const match = s.shift.match(/\(([\d:]+)\s*-/);
                            if (match) {
                              const [h, m] = match[1].split(":").map(Number);
                              const startMinutes = h * 60 + m;
                              if (currentMinutes >= startMinutes - 30) {
                                canCheckIn = true;
                                break;
                              }
                            }
                          }
                        }

                        return canCheckIn ? (
                          <button
                            onClick={handleAction}
                            className="w-full py-5 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-xl text-2xl font-bold shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-1"
                          >
                            BẮT ĐẦU CA LÀM (CHECK-IN)
                          </button>
                        ) : (
                          <div className="py-6 bg-gray-50 border border-gray-200 rounded-xl">
                            <div className="text-gray-600 flex flex-col items-center justify-center gap-2">
                              <span className="text-lg font-medium text-center px-4">
                                Bạn không có ca làm việc lúc này, hoặc đã hết
                                ca.
                                <br />
                                <span className="text-sm">
                                  (Chỉ hiển thị nút Bắt Đầu trước giờ làm 30
                                  phút)
                                </span>
                              </span>
                            </div>
                          </div>
                        );
                      })()
                    : todayAttendance?.checkIn && !todayAttendance?.checkOut
                      ? (() => {
                          const calculateTotalMs = () => {
                            let total = 0;
                            if (
                              todayAttendance.logs &&
                              todayAttendance.logs.length > 0
                            ) {
                              let lastIn: Date | null = null;
                              for (const log of todayAttendance.logs) {
                                if (log.action === "CHECK_IN") {
                                  lastIn = log.time;
                                } else if (
                                  log.action === "CHECK_OUT" &&
                                  lastIn
                                ) {
                                  total +=
                                    log.time.getTime() - lastIn.getTime();
                                  lastIn = null;
                                }
                              }
                              if (lastIn && !todayAttendance.checkOut) {
                                total +=
                                  currentTime.getTime() - lastIn.getTime();
                              }
                            } else {
                              total =
                                currentTime.getTime() -
                                (todayAttendance.checkIn?.getTime() ||
                                  currentTime.getTime());
                            }
                            return total;
                          };
                          const diffMs = calculateTotalMs();
                          const validDiff = diffMs > 0 ? diffMs : 0;
                          const hours = Math.floor(
                            validDiff / (1000 * 60 * 60),
                          );
                          const minutes = Math.floor(
                            (validDiff % (1000 * 60 * 60)) / (1000 * 60),
                          );
                          const seconds = Math.floor(
                            (validDiff % (1000 * 60)) / 1000,
                          );
                          const h = hours.toString().padStart(2, "0");
                          const m = minutes.toString().padStart(2, "0");
                          const s = seconds.toString().padStart(2, "0");
                          return (
                            <div className="space-y-4 w-full">
                              <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
                                <div className="grid grid-cols-2 gap-4 text-center">
                                  <div>
                                    <p className="text-sm text-orange-600 mb-1 font-medium">
                                      Giờ vào ca
                                    </p>
                                    <p className="text-xl font-bold text-orange-800">
                                      {todayAttendance.checkIn?.toLocaleTimeString(
                                        "vi-VN",
                                        { hour12: false },
                                      ) || "--:--:--"}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-sm text-orange-600 mb-1 font-medium">
                                      Thời gian làm
                                    </p>
                                    <p className="text-xl font-bold text-orange-800 font-mono">
                                      {h}:{m}:{s}
                                    </p>
                                  </div>
                                </div>
                              </div>
                              <button
                                onClick={handleAction}
                                className="w-full py-5 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-xl text-2xl font-bold shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-1"
                              >
                                KẾT THÚC CA (CHECK-OUT)
                              </button>
                            </div>
                          );
                        })()
                      : (() => {
                          let canCheckIn = false;
                          if (todayShifts.length > 0) {
                            const now = new Date();
                            const currentMinutes =
                              now.getHours() * 60 + now.getMinutes();
                            for (const s of todayShifts) {
                              if (!s.shift) continue;
                              const match = s.shift.match(/\(([\d:]+)\s*-/);
                              const matchEnd = s.shift.match(/-\s*([\d:]+)\)/);
                              if (match && matchEnd) {
                                const [h1, m1] = match[1]
                                  .split(":")
                                  .map(Number);
                                const startMinutes = h1 * 60 + m1;
                                const [h2, m2] = matchEnd[1]
                                  .split(":")
                                  .map(Number);
                                let endMinutes = h2 * 60 + m2;
                                if (endMinutes < startMinutes)
                                  endMinutes += 24 * 60;
                                if (
                                  currentMinutes >= startMinutes - 30 &&
                                  currentMinutes <= endMinutes
                                ) {
                                  canCheckIn = true;
                                  break;
                                }
                              }
                            }
                          }

                          return canCheckIn ? (
                            <div className="space-y-4">
                              <div className="py-6 bg-orange-50 border border-orange-200 rounded-xl">
                                <div className="text-orange-600 font-bold flex flex-col items-center justify-center gap-2">
                                  <span className="text-xl text-center px-4">
                                    BẠN ĐÃ CHECK-OUT SỚM!
                                  </span>
                                  <span className="text-sm font-normal text-center px-4">
                                    Ca làm việc của bạn vẫn chưa kết thúc. Bạn
                                    có thể tiếp tục ca làm.
                                  </span>
                                </div>
                              </div>
                              <button
                                onClick={handleAction}
                                className="w-full py-5 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-xl text-2xl font-bold shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-1"
                              >
                                TIẾP TỤC CA LÀM (CHECK-IN LẠI)
                              </button>
                            </div>
                          ) : checkoutSuccess ? (
                            <div className="py-6 bg-green-50 border border-green-200 rounded-xl">
                              <div className="text-green-600 font-bold flex flex-col items-center justify-center gap-2">
                                <CheckCircle size={40} />
                                <span className="text-xl">
                                  BẠN ĐÃ HOÀN THÀNH CA LÀM HÔM NAY
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div className="py-6 bg-gray-50 border border-gray-200 rounded-xl">
                              <div className="text-gray-600 flex flex-col items-center justify-center gap-2">
                                <span className="text-lg font-medium text-center px-4">
                                  Bạn không có ca làm việc lúc này, hoặc đã hết
                                  ca.
                                  <br />
                                  <span className="text-sm">
                                    (Chỉ hiển thị nút trước giờ làm 30 phút)
                                  </span>
                                </span>
                              </div>
                            </div>
                          );
                        })()}
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background-color: #CBD5E1;
          border-radius: 20px;
        }
      `}</style>
    </div>
  );
};

export default Kiosk;
