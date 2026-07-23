import React, { useState, useEffect } from "react";
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  query,
  where,
  getDoc,
} from "firebase/firestore";
import { db } from "../config/firebase";
import toast from "react-hot-toast";
import {
  Clock,
  Edit2,
  Check,
  X,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { TimeInput24 } from "../components/TimeInput24";

interface Employee {
  id: string;
  fullName: string;
  employeeCode?: string;
  branchName: string;
  branchId?: string;
  salaryPerHour?: number;
  position?: string;
}

interface AttendanceRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode?: string;
  branchName: string;
  branchId?: string;
  date: string;
  checkIn: Date | null;
  checkOut: Date | null;
  status: string;
  shiftStr?: string;
  logs?: any[];
  totalMs?: number;
}

const Attendance: React.FC = () => {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);

  const [filterDate, setFilterDate] = useState(() =>
    new Date().toLocaleDateString("en-CA"),
  );
  const [filterBranchId, setFilterBranchId] = useState("");
  const [branches, setBranches] = useState<any[]>([]);

  // Manual check-in form
  const [selectedEmp, setSelectedEmp] = useState("");
  const [isSelectOpen, setIsSelectOpen] = useState(false);

  const [selectedLogs, setSelectedLogs] = useState<any[] | null>(null);

  // Edit mode state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCheckIn, setEditCheckIn] = useState<string>("");
  const [editCheckOut, setEditCheckOut] = useState<string>("");

  const fetchAttendance = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const userRole = localStorage.getItem("userRole");
      const currentUserEmployeeId = localStorage.getItem("employeeId");

      // 1. Get Employees
      const empSnap = await getDocs(collection(db, "employees"));
      const empList: Employee[] = [];
      let currentUserBranchId = "";

      if (userRole === "SUPER_ADMIN") {
        const branchSnap = await getDocs(collection(db, "branches"));
        const brs: any[] = [];
        branchSnap.forEach((b) => brs.push({ id: b.id, name: b.data().name }));
        setBranches(brs);
        if (brs.length > 0) {
          setFilterBranchId((prev) => prev || "ALL");
        }
      }

      if (currentUserEmployeeId) {
        empSnap.forEach((doc) => {
          if (doc.id === currentUserEmployeeId) {
            currentUserBranchId = doc.data().branchId;
          }
        });
      }

      empSnap.forEach((d) => {
        const data = d.data();

        // Hide self
        if (d.id === currentUserEmployeeId) return;

        // Branch admin can only see their own branch's employees
        if (
          userRole === "BRANCH_ADMIN" &&
          data.branchId !== currentUserBranchId
        ) {
          return;
        }

        empList.push({
          id: d.id,
          fullName: data.fullName,
          employeeCode: data.employeeCode,
          branchName: data.branchName,
          branchId: data.branchId,
          position: data.position || "Khác",
          salaryPerHour: data.salaryPerHour || 0,
        });
      });
      setEmployees(empList);

      // 2. Get attendance for the selected date
      const attQuery = query(
        collection(db, "attendance"),
        where("date", "==", filterDate),
      );
      const attSnap = await getDocs(attQuery);

      const schQuery = query(
        collection(db, "schedules"),
        where("date", "==", filterDate),
      );
      const schSnap = await getDocs(schQuery);
      const schList: any[] = [];
      schSnap.forEach((d) => schList.push({ id: d.id, ...d.data() }));

      const rawAtts: any[] = [];
      attSnap.forEach((d) => {
        const data = d.data();
        rawAtts.push({
          id: d.id,
          ...data,
          checkIn: data.checkIn?.toDate(),
          checkOut: data.checkOut?.toDate(),
          logs:
            data.logs?.map((l: any) => ({
              action: l.action,
              time: l.time?.toDate(),
            })) || [],
        });
      });

      const attList: AttendanceRecord[] = [];

      empList.forEach((emp) => {
        if (emp.id === currentUserEmployeeId) return;
        if (userRole === "BRANCH_ADMIN" && emp.branchId !== currentUserBranchId)
          return;

        const myAtts = rawAtts
          .filter((a) => a.employeeId === emp.id)
          .sort(
            (a, b) => (a.checkIn?.getTime() || 0) - (b.checkIn?.getTime() || 0),
          );

        const myShifts = schList
          .filter((s) => s.employeeId === emp.id)
          .sort((a, b) => {
            const mA = a.shift.match(/\((\d{2}):(\d{2})/);
            const mB = b.shift.match(/\((\d{2}):(\d{2})/);
            const tA = mA ? parseInt(mA[1]) * 60 + parseInt(mA[2]) : 0;
            const tB = mB ? parseInt(mB[1]) * 60 + parseInt(mB[2]) : 0;
            return tA - tB;
          });

        const todayStr = new Date().toLocaleDateString("en-CA");
        const now = new Date();
        const nowM = now.getHours() * 60 + now.getMinutes();

        const paired: { shift?: any; att?: any }[] = [];
        const usedAtts = new Set<number>();

        myShifts.forEach((shift) => {
          let shiftEndM = 0;
          const matchStart = shift.shift.match(/\((\d{2}):(\d{2})/);
          const matchEnd = shift.shift.match(/-\s*(\d{2}):(\d{2})/);
          if (matchStart && matchEnd) {
            const shiftStartM =
              parseInt(matchStart[1]) * 60 + parseInt(matchStart[2]);
            shiftEndM = parseInt(matchEnd[1]) * 60 + parseInt(matchEnd[2]);
            if (shiftEndM < shiftStartM) shiftEndM += 24 * 60;
          }

          let bestAttIdx = -1;
          for (let i = 0; i < myAtts.length; i++) {
            if (usedAtts.has(i)) continue;
            const att = myAtts[i];
            if (att.checkIn) {
              const inM =
                att.checkIn.getHours() * 60 + att.checkIn.getMinutes();
              if (shiftEndM === 0 || inM < shiftEndM + 120) {
                bestAttIdx = i;
                break;
              }
            } else {
              bestAttIdx = i;
              break;
            }
          }

          if (bestAttIdx !== -1) {
            paired.push({ shift, att: myAtts[bestAttIdx] });
            usedAtts.add(bestAttIdx);
          } else {
            paired.push({ shift });
          }
        });

        myAtts.forEach((att, idx) => {
          if (!usedAtts.has(idx)) {
            paired.push({ att });
          }
        });

        if (paired.length === 0) return;

        paired.forEach((pair, i) => {
          const { shift, att } = pair;

          let calcStatus = "Không có mặt";
          if (!shift) {
            if (att) {
              if (att.checkIn && !att.checkOut) calcStatus = "Đang làm";
              else calcStatus = "Hoàn thành";
            } else {
              calcStatus = "Không có mặt";
            }
          } else {
            let shiftStartM = 0;
            const match = shift.shift.match(/\((\d{2}):(\d{2})/);
            if (match) {
              shiftStartM = parseInt(match[1]) * 60 + parseInt(match[2]);
            }
            if (!att) {
              if (filterDate > todayStr) calcStatus = "Chưa tới ca";
              else if (filterDate < todayStr) calcStatus = "Vắng mặt";
              else {
                if (nowM > shiftStartM + 15) calcStatus = "Vắng mặt";
                else if (nowM < shiftStartM - 30) calcStatus = "Chưa tới ca";
                else calcStatus = "Chưa check-in";
              }
            } else {
              let isLate = false;
              let isEarly = false;
              if (att.checkIn) {
                const inM =
                  att.checkIn.getHours() * 60 + att.checkIn.getMinutes();
                if (inM > shiftStartM + 15) isLate = true;
              }
              if (att.checkOut) {
                const outM =
                  att.checkOut.getHours() * 60 + att.checkOut.getMinutes();
                let shiftEndM = 0;
                const matchEnd = shift.shift.match(/-\s*(\d{2}):(\d{2})/);
                if (matchEnd) {
                  shiftEndM =
                    parseInt(matchEnd[1]) * 60 + parseInt(matchEnd[2]);
                  if (shiftEndM < shiftStartM) shiftEndM += 24 * 60;
                }
                if (outM < shiftEndM) isEarly = true;
              }

              if (!att.checkOut)
                calcStatus = isLate
                  ? "Đang làm (Đi muộn)"
                  : "Đang làm (Đúng giờ)";
              else {
                if (isLate && isEarly) calcStatus = "Hoàn thành (Muộn/Sớm)";
                else if (isLate) calcStatus = "Hoàn thành (Đi muộn)";
                else if (isEarly) calcStatus = "Hoàn thành (Về sớm)";
                else calcStatus = "Hoàn thành (Đúng giờ)";
              }

              if (att.logs && att.logs.length > 3) {
                calcStatus += " - Ngắt quãng";
              }
            }
          }

          let totalMs = 0;
          if (att) {
            if (att.logs && att.logs.length > 0) {
              let lastIn: Date | null = null;
              for (const log of att.logs) {
                if (log.action === "CHECK_IN") {
                  lastIn = log.time;
                } else if (log.action === "CHECK_OUT" && lastIn) {
                  totalMs += log.time.getTime() - lastIn.getTime();
                  lastIn = null;
                }
              }
              if (lastIn && filterDate === todayStr) {
                totalMs += new Date().getTime() - lastIn.getTime();
              }
            } else if (att.checkIn && att.checkOut) {
              totalMs = att.checkOut.getTime() - att.checkIn.getTime();
            } else if (att.checkIn && filterDate === todayStr) {
              totalMs = new Date().getTime() - att.checkIn.getTime();
            }
          }

          if (calcStatus === "Chưa tới ca") return;

          attList.push({
            id: att?.id || `temp-${emp.id}-${i}`,
            employeeId: emp.id,
            employeeName: emp.fullName,
            employeeCode: emp.employeeCode,
            branchName: emp.branchName,
            branchId: emp.branchId,
            date: filterDate,
            checkIn: att?.checkIn || null,
            checkOut: att?.checkOut || null,
            status: calcStatus,
            shiftStr: shift
              ? shift.shift
              : att?.assignedRole
                ? `Ca được giao\n(bởi ${att.assignedRole})`
                : "Ca được giao",
            logs: att?.logs,
            totalMs,
          });
        });
      });

      attList.sort((a, b) => {
        const timeA =
          a.checkIn instanceof Date && !isNaN(a.checkIn.getTime())
            ? a.checkIn.getTime()
            : 0;
        const timeB =
          b.checkIn instanceof Date && !isNaN(b.checkIn.getTime())
            ? b.checkIn.getTime()
            : 0;

        // Nếu cả 2 đều chưa check-in (time = 0), xếp theo mã nhân viên để ổn định thứ tự (Z-A để STT chạy từ A-Z)
        if (timeA === 0 && timeB === 0) {
          return (b.employeeCode || "").localeCompare(a.employeeCode || "");
        }

        // Ai chưa check-in thì đẩy xuống dưới cùng
        if (timeA > 0 && timeB === 0) return -1; // a có giờ, b không có -> a xếp trước
        if (timeA === 0 && timeB > 0) return 1; // a không có, b có -> b xếp trước

        // Cả 2 đều có giờ: check-in MỚI NHẤT (lớn hơn) thì xếp TRƯỚC (trên đầu)
        return timeB - timeA;
      });

      setRecords(attList);
    } catch (error) {
      console.error(error);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchAttendance();
  }, [filterDate]);

  const handleAction = async () => {
    if (!selectedEmp) {
      toast.error("Vui lòng chọn nhân viên!");
      return;
    }

    const emp = employees.find((e) => e.id === selectedEmp);
    if (!emp) return;

    // Kiểm tra xem đã check-in hôm nay nhưng chưa check-out chưa
    const today = new Date().toLocaleDateString("en-CA");

    const existing = records.find(
      (r) =>
        r.employeeId === selectedEmp &&
        r.checkIn &&
        !r.checkOut,
    );

    try {
      if (existing) {
        // Đã check-in => Thực hiện check-out

        // Kiểm tra xem nhân viên này có đang giữ ca (chưa chốt ca) không
        if (emp.branchId) {
          const shiftQ = query(
            collection(db, "shift_reports"),
            where("branchId", "==", emp.branchId),
            where("status", "==", "OPEN"),
          );
          const shiftSnap = await getDocs(shiftQ);
          if (!shiftSnap.empty) {
            const openShifts = shiftSnap.docs.map((d) => d.data());
            const code = emp.employeeCode || emp.id;
            const isHoldingShift = openShifts.some((shift) => {
              const cName = shift.cashierName || shift.cashierEmail || "";
              return (
                cName.includes(code) ||
                (emp.fullName && cName.includes(emp.fullName))
              );
            });
            if (isHoldingShift) {
              toast.error(
                "Nhân viên này đang giữ ca! Vui lòng vào Bàn giao ca để chốt ca cho nhân viên này trước khi check-out.",
              );
              return;
            }
          }
        }

        const checkOutTime = new Date();
        const logs = existing.logs || [];
        await updateDoc(doc(db, "attendance", existing.id), {
          checkOut: checkOutTime,
          logs: [...logs, { action: "CHECK_OUT", time: checkOutTime }],
        });
        toast.success(`Đã Check-out cho ${emp.fullName}!`);
      } else {
        // Chưa check-in => Thực hiện check-in
        const checkInTime = new Date();
        const nowM = checkInTime.getHours() * 60 + checkInTime.getMinutes();

        let targetRecord = null;
        const empRecords = records.filter(
          (r) => r.employeeId === selectedEmp && r.date === today,
        );

        // 1. Tìm xem có ca làm việc nào đang trong khung giờ này không
        for (const r of empRecords) {
          if (r.shiftStr && !r.shiftStr.includes("Ca được giao")) {
            const matchStart = r.shiftStr.match(/\((\d{2}):(\d{2})/);
            const matchEnd = r.shiftStr.match(/-\s*(\d{2}):(\d{2})/);
            if (matchStart && matchEnd) {
              const startM =
                parseInt(matchStart[1]) * 60 + parseInt(matchStart[2]);
              let endM = parseInt(matchEnd[1]) * 60 + parseInt(matchEnd[2]);
              if (endM < startM) endM += 24 * 60;
              if (nowM >= startM - 60 && nowM <= endM + 120) {
                // Nếu r.checkIn cũng nằm trong ca này, hoặc chưa có checkIn (temp-)
                if (
                  !r.checkIn ||
                  (r.checkIn.getHours() * 60 + r.checkIn.getMinutes() >=
                    startM - 60 &&
                    r.checkIn.getHours() * 60 + r.checkIn.getMinutes() <=
                      endM + 120)
                ) {
                  targetRecord = r;
                  break;
                }
              }
            }
          }
        }

        // 2. Nếu không có ca nào khớp giờ hiện tại, xem có ca nào sắp tới/trống không
        if (!targetRecord) {
          targetRecord = empRecords.find((r) => !r.checkIn);
        }

        const schedQ = query(
          collection(db, "schedules"),
          where("employeeId", "==", emp.id),
          where("date", "==", today),
        );
        const schedSnap = await getDocs(schedQ);
        let maxMultiplier = 1;
        schedSnap.forEach((d) => {
          const s = d.data();
          if (s.salaryMultiplier && s.salaryMultiplier > maxMultiplier) {
            maxMultiplier = s.salaryMultiplier;
          }
        });
        const finalSalary = (emp.salaryPerHour || 0) * maxMultiplier;

        if (targetRecord && !targetRecord.id.startsWith("temp-")) {
          // Đã có record thật trong DB -> Cập nhật lại (Reopen)
          const logs = targetRecord.logs || [];
          const isReopen = !!targetRecord.checkIn;
          await updateDoc(doc(db, "attendance", targetRecord.id), {
            checkIn: isReopen ? targetRecord.checkIn : checkInTime,
            checkOut: null,
            status: "PRESENT",
            salaryPerHour: finalSalary,
            logs: [...logs, { action: "CHECK_IN", time: checkInTime }],
            assignedBy: localStorage.getItem("userEmail") || "Hệ thống",
            assignedRole:
              localStorage.getItem("userRole") === "SUPER_ADMIN"
                ? "Quản trị viên"
                : "Quản lý cơ sở",
          });
        } else {
          // Tạo mới hoàn toàn
          await addDoc(collection(db, "attendance"), {
            employeeId: emp.id,
            employeeName: emp.fullName,
            branchName: emp.branchName,
            branchId: emp.branchId || null,
            date: today,
            checkIn: checkInTime,
            checkOut: null,
            status: "PRESENT",
            salaryPerHour: finalSalary,
            logs: [{ action: "CHECK_IN", time: checkInTime }],
            assignedBy: localStorage.getItem("userEmail") || "Hệ thống",
            assignedRole:
              localStorage.getItem("userRole") === "SUPER_ADMIN"
                ? "Quản trị viên"
                : "Quản lý cơ sở",
          });
        }
        toast.success(`Đã Check-in cho ${emp.fullName}!`);
      }
      fetchAttendance(true);
    } catch (error) {
      toast.error("Có lỗi xảy ra!");
      console.error(error);
    }
  };

  const handleEdit = (record: AttendanceRecord) => {
    setEditingId(record.id);
    setEditCheckIn(
      record.checkIn ? record.checkIn.toTimeString().slice(0, 5) : "",
    );
    setEditCheckOut(
      record.checkOut ? record.checkOut.toTimeString().slice(0, 5) : "",
    );
  };

  const handleSaveEdit = async (record: AttendanceRecord) => {
    try {
      const updates: any = {};
      if (editCheckIn) {
        const [h, m] = editCheckIn.split(":");
        // fallback to new Date() if somehow date is malformed
        const baseDateIn = record.checkIn
          ? new Date(record.checkIn)
          : new Date(record.date + "T00:00:00");
        baseDateIn.setHours(parseInt(h), parseInt(m), 0);
        updates.checkIn = baseDateIn;
      }
      if (editCheckOut) {
        const [h, m] = editCheckOut.split(":");
        const baseDateOut = record.checkOut
          ? new Date(record.checkOut)
          : record.checkIn
            ? new Date(record.checkIn)
            : new Date(record.date + "T00:00:00");
        baseDateOut.setHours(parseInt(h), parseInt(m), 0);
        updates.checkOut = baseDateOut;
      }

      if (Object.keys(updates).length > 0) {
        if (updates.checkOut && record.branchId) {
          const shiftQ = query(
            collection(db, "shift_reports"),
            where("branchId", "==", record.branchId),
            where("status", "==", "OPEN"),
          );
          const shiftSnap = await getDocs(shiftQ);
          if (!shiftSnap.empty) {
            const openShifts = shiftSnap.docs.map((d) => d.data());
            const code = record.employeeCode || record.employeeId;
            const isHoldingShift = openShifts.some((shift) => {
              const cName = shift.cashierName || shift.cashierEmail || "";
              return (
                cName.includes(code) ||
                (record.employeeName && cName.includes(record.employeeName))
              );
            });
            if (isHoldingShift) {
              toast.error(
                "Nhân viên này đang giữ ca! Vui lòng vào Bàn giao ca chốt ca trước khi check-out.",
              );
              return;
            }
          }
        }

        const finalCheckIn = updates.checkIn || record.checkIn;
        const finalCheckOut = updates.checkOut || record.checkOut;

        const newLogs = [];
        if (finalCheckIn) {
          newLogs.push({ action: "CHECK_IN", time: finalCheckIn });
        }
        if (finalCheckOut) {
          newLogs.push({ action: "CHECK_OUT", time: finalCheckOut });
        }
        updates.logs = newLogs;

        if (record.id.startsWith("temp-")) {
          const empDoc = await getDoc(doc(db, "employees", record.employeeId));
          let salaryPerHour = 0;
          if (empDoc.exists()) {
            salaryPerHour = empDoc.data().salaryPerHour || 0;
          }
          await addDoc(collection(db, "attendance"), {
            ...updates,
            employeeId: record.employeeId,
            employeeName: record.employeeName,
            branchName: record.branchName,
            branchId: record.branchId,
            date: record.date,
            status: "PRESENT",
            salaryPerHour,
          });
        } else {
          await updateDoc(doc(db, "attendance", record.id), updates);
        }
        toast.success("Cập nhật giờ thành công!");
        fetchAttendance(true);
      }
      setEditingId(null);
    } catch (error) {
      console.error(error);
      toast.error("Lỗi cập nhật giờ!");
    }
  };

  const handlePrevDay = () => {
    const d = new Date(filterDate);
    d.setDate(d.getDate() - 1);
    setFilterDate(d.toLocaleDateString("en-CA"));
  };

  const handleNextDay = () => {
    const d = new Date(filterDate);
    d.setDate(d.getDate() + 1);
    setFilterDate(d.toLocaleDateString("en-CA"));
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Quản lý Chấm công</h2>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <div className="flex items-center gap-1 w-full sm:w-auto">
              <button
                onClick={handlePrevDay}
                className="p-1 hover:bg-gray-100 rounded text-gray-600 transition-colors"
                title="Ngày hôm trước"
              >
                <ChevronLeft size={20} />
              </button>
              <input
                type="date"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                className="px-3 py-1.5 border border-gray-300 rounded outline-none focus:ring-1 focus:ring-blue-500 text-sm"
              />
              <button
                onClick={handleNextDay}
                className="p-1 hover:bg-gray-100 rounded text-gray-600 transition-colors"
                title="Ngày hôm sau"
              >
                <ChevronRight size={20} />
              </button>
            </div>
            {localStorage.getItem("userRole") === "SUPER_ADMIN" && (
              <select
                value={filterBranchId}
                onChange={(e) => setFilterBranchId(e.target.value)}
                className="px-3 py-1.5 border border-gray-300 rounded outline-none focus:ring-1 focus:ring-blue-500 text-sm bg-gray-50"
              >
                <option value="ALL">Tất cả cơ sở</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 bg-blue-50 p-3 rounded-lg border border-blue-100 w-full md:w-auto">
          <div className="relative w-full sm:w-auto">
            <div
              className="px-3 py-2 border border-gray-300 bg-white rounded-lg cursor-pointer flex items-center justify-between w-full sm:min-w-[250px]"
              onClick={() => setIsSelectOpen(!isSelectOpen)}
            >
              <span className="truncate pr-4">
                {selectedEmp
                  ? (() => {
                      const emp = employees.find((e) => e.id === selectedEmp);
                      if (!emp) return "-- Chọn nhân viên --";
                      const empRecords = records.filter(
                        (r) => r.employeeId === selectedEmp,
                      );
                      let textClass = "text-gray-800";
                      if (
                        empRecords.some((r) => r.status.includes("Đang làm"))
                      ) {
                        textClass = "text-green-600 font-bold";
                      } else if (
                        empRecords.some((r) => r.status.includes("Vắng mặt"))
                      ) {
                        textClass = "text-red-600 font-bold";
                      }
                      return (
                        <span className={textClass}>
                          [{emp.employeeCode || "No ID"}] {emp.fullName}
                        </span>
                      );
                    })()
                  : "-- Chọn nhân viên --"}
              </span>
              <span className="text-gray-400 text-xs">▼</span>
            </div>

            {isSelectOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setIsSelectOpen(false)}
                ></div>
                <div className="absolute z-50 mt-1 left-0 right-0 sm:right-auto sm:w-max sm:min-w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  <div
                    className="px-4 py-2 hover:bg-gray-50 cursor-pointer text-gray-700"
                    onClick={() => {
                      setSelectedEmp("");
                      setIsSelectOpen(false);
                    }}
                  >
                    -- Chọn nhân viên --
                  </div>
                  {(() => {
                    const filtered = employees.filter(
                      (e) =>
                        localStorage.getItem("userRole") !== "SUPER_ADMIN" ||
                        filterBranchId === "ALL" ||
                        e.branchId === filterBranchId,
                    );

                    const grouped: Record<string, Employee[]> = {};
                    filtered.forEach((e) => {
                      const pos = e.position || "Khác";
                      if (!grouped[pos]) grouped[pos] = [];
                      grouped[pos].push(e);
                    });

                    const positionOrder = [
                      "Quản lý",
                      "Quản lý cơ sở",
                      "Trưởng ca",
                      "Thu ngân",
                      "Pha chế",
                      "Phục vụ",
                      "Nhân viên",
                      "Bảo vệ",
                      "Tạp vụ",
                      "Khác",
                    ];
                    const sortedPositions = Object.keys(grouped).sort(
                      (a, b) => {
                        const idxA = positionOrder.indexOf(a);
                        const idxB = positionOrder.indexOf(b);
                        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
                        if (idxA !== -1) return -1;
                        if (idxB !== -1) return 1;
                        return a.localeCompare(b);
                      },
                    );

                    return sortedPositions.map((pos) => (
                      <div key={pos}>
                        <div className="px-3 py-1.5 bg-gray-50 text-xs font-bold text-gray-500 uppercase tracking-wider">
                          {pos}
                        </div>
                        {grouped[pos].map((e) => {
                          const empRecords = records.filter(
                            (r) => r.employeeId === e.id,
                          );
                          let textClass = "text-gray-700";
                          if (
                            empRecords.some((r) =>
                              r.status.includes("Đang làm"),
                            )
                          ) {
                            textClass = "text-green-600 font-medium";
                          } else if (
                            empRecords.some((r) =>
                              r.status.includes("Vắng mặt"),
                            )
                          ) {
                            textClass = "text-red-600 font-medium";
                          } else if (selectedEmp === e.id) {
                            textClass = "text-blue-700 font-medium";
                          }

                          return (
                            <div
                              key={e.id}
                              className={`px-4 py-2 hover:bg-blue-50 cursor-pointer flex items-center ${selectedEmp === e.id ? "bg-blue-50" : ""}`}
                              onClick={() => {
                                setSelectedEmp(e.id);
                                setIsSelectOpen(false);
                              }}
                            >
                              <span className={`truncate ${textClass}`}>
                                [{e.employeeCode || "No ID"}] {e.fullName} -{" "}
                                {e.branchName}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ));
                  })()}
                </div>
              </>
            )}
          </div>
          <button
            onClick={handleAction}
            className={`px-4 py-2 rounded-lg font-medium shadow-sm transition-colors text-white w-full sm:w-auto ${(() => {
              const today = new Date().toLocaleDateString("en-CA");
              const existing = records.find(
                (r) =>
                  r.employeeId === selectedEmp &&
                  r.date === today &&
                  r.checkIn &&
                  !r.checkOut,
              );
              return existing
                ? "bg-orange-600 hover:bg-orange-700"
                : "bg-blue-600 hover:bg-blue-700";
            })()}`}
          >
            {(() => {
              const today = new Date().toLocaleDateString("en-CA");
              const existing = records.find(
                (r) =>
                  r.employeeId === selectedEmp &&
                  r.date === today &&
                  r.checkIn &&
                  !r.checkOut,
              );
              return existing ? "Check-Out Ngay" : "Check-In Ngay";
            })()}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto overflow-y-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">
            Đang tải dữ liệu chấm công...
          </div>
        ) : (
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="p-4 font-semibold text-gray-600 text-sm">STT</th>
                <th className="p-4 font-semibold text-gray-600 text-sm">
                  Nhân viên
                </th>
                <th className="p-4 font-semibold text-gray-600 text-sm">
                  Cơ sở
                </th>
                <th className="p-4 font-semibold text-gray-600 text-sm">
                  Ngày làm
                </th>
                <th className="p-4 font-semibold text-gray-600 text-sm">
                  Ca làm việc
                </th>
                <th className="p-4 font-semibold text-gray-600 text-sm">
                  Giờ Vào (Check-in)
                </th>
                <th className="p-4 font-semibold text-gray-600 text-sm">
                  Giờ Ra (Check-out)
                </th>
                <th className="p-4 font-semibold text-gray-600 text-sm">
                  Tổng giờ làm
                </th>
                <th className="p-4 font-semibold text-gray-600 text-sm">
                  Trạng thái
                </th>
                <th className="p-4 font-semibold text-gray-600 text-sm text-right">
                  Thao Tác
                </th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const filtered = records.filter(
                  (r) =>
                    localStorage.getItem("userRole") !== "SUPER_ADMIN" ||
                    filterBranchId === "ALL" ||
                    r.branchId === filterBranchId,
                );
                if (filtered.length === 0) {
                  return (
                    <tr>
                      <td
                        colSpan={10}
                        className="p-8 text-center text-gray-500"
                      >
                        Chưa có ai chấm công ngày này.
                      </td>
                    </tr>
                  );
                }
                return filtered.map((record, index) => (
                  <tr
                    key={record.id}
                    className="border-b border-gray-100 hover:bg-gray-50"
                  >
                    <td className="p-4 text-sm text-gray-600 font-medium">
                      {filtered.length - index}
                    </td>
                    <td className="p-4 text-sm font-medium text-gray-800 whitespace-normal break-words min-w-[150px]">
                      [{record.employeeCode || "No ID"}] {record.employeeName}
                    </td>
                    <td className="p-4 text-sm text-gray-600">
                      {record.branchName}
                    </td>
                    <td className="p-4 text-sm text-gray-600">
                      {(() => {
                        const inDateStr = record.checkIn
                          ? record.checkIn.toLocaleDateString("vi-VN")
                          : new Date(record.date).toLocaleDateString("vi-VN");
                        const outDateStr = record.checkOut
                          ? record.checkOut.toLocaleDateString("vi-VN")
                          : null;
                        if (outDateStr && inDateStr !== outDateStr) {
                          return `${inDateStr} - ${outDateStr}`;
                        }
                        return inDateStr;
                      })()}
                    </td>
                    <td className="p-4 text-sm text-gray-600 whitespace-pre-line leading-relaxed">
                      {record.shiftStr || "Ca được giao"}
                    </td>
                    <td className="p-4 text-sm text-green-600 font-medium">
                      {editingId === record.id ? (
                        <TimeInput24
                          value={editCheckIn}
                          onChange={setEditCheckIn}
                          className="border border-gray-300 rounded focus-within:ring-2 focus-within:ring-blue-500 text-black w-32 h-8 bg-white"
                        />
                      ) : (
                        <div className="flex items-center gap-1">
                          <Clock size={16} className="mr-1" />
                          {record.checkIn
                            ? record.checkIn.toLocaleTimeString("vi-VN")
                            : "--:--"}
                        </div>
                      )}
                    </td>
                    <td className="p-4 text-sm text-orange-600 font-medium">
                      {editingId === record.id ? (
                        <TimeInput24
                          value={editCheckOut}
                          onChange={setEditCheckOut}
                          className="border border-gray-300 rounded focus-within:ring-2 focus-within:ring-blue-500 text-black w-32 h-8 bg-white"
                        />
                      ) : record.checkOut ? (
                        <div className="flex items-center gap-1">
                          <Clock size={16} className="mr-1" />
                          {record.checkOut.toLocaleTimeString("vi-VN")}
                        </div>
                      ) : (
                        "--:--"
                      )}
                    </td>
                    <td className="p-4 text-sm text-blue-600 font-medium">
                      {(() => {
                        if (record.totalMs) {
                          const diff = record.totalMs;
                          const hrs = Math.floor(diff / (1000 * 60 * 60));
                          const mins = Math.floor(
                            (diff % (1000 * 60 * 60)) / (1000 * 60),
                          );
                          const secs = Math.floor((diff % (1000 * 60)) / 1000);
                          return `${hrs} giờ ${mins} phút ${secs} giây`;
                        }
                        return "--";
                      })()}
                    </td>
                    <td className="p-4">
                      <div className="flex flex-col items-start gap-2">
                        {(() => {
                          let colorClass = "bg-green-100 text-green-700";
                          if (record.status.includes("Vắng mặt"))
                            colorClass = "bg-red-100 text-red-700";
                          else if (
                            record.status.includes("Chưa") ||
                            record.status.includes("Không có mặt")
                          )
                            colorClass = "bg-gray-100 text-gray-700";
                          else if (
                            record.status.includes("muộn") ||
                            record.status.includes("sớm") ||
                            record.status.includes("Muộn/Sớm") ||
                            record.status.includes("Ngắt quãng")
                          )
                            colorClass = "bg-yellow-100 text-yellow-700";
                          else if (record.status.includes("Đang làm"))
                            colorClass = "bg-blue-100 text-blue-700";

                          return (
                            <span
                              className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${colorClass}`}
                            >
                              {record.status}
                            </span>
                          );
                        })()}
                        {record.logs && record.logs.length > 0 && (
                          <button
                            onClick={() => setSelectedLogs(record.logs!)}
                            className="text-xs text-blue-600 hover:text-blue-800 underline transition-colors"
                          >
                            Chi tiết lịch sử
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="p-4 flex justify-end items-center gap-2">
                      {editingId === record.id ? (
                        <>
                          <button
                            onClick={() => handleSaveEdit(record)}
                            className="text-green-600 hover:bg-green-50 p-1.5 rounded-lg"
                          >
                            <Check size={18} />
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="text-gray-500 hover:bg-gray-50 p-1.5 rounded-lg"
                          >
                            <X size={18} />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => handleEdit(record)}
                            className="text-blue-500 hover:bg-blue-50 p-1.5 rounded-lg"
                            title="Sửa giờ"
                          >
                            <Edit2 size={16} />
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ));
              })()}
            </tbody>
          </table>
        )}
      </div>

      {selectedLogs && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm transition-opacity">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden flex flex-col">
            <div className="flex justify-between items-center p-4 border-b border-gray-100 bg-gray-50">
              <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                <Clock className="w-5 h-5 text-blue-600" />
                Lịch sử Ra/Vào ca
              </h3>
              <button
                onClick={() => setSelectedLogs(null)}
                className="text-gray-400 hover:text-gray-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 max-h-[60vh] overflow-y-auto">
              <div className="space-y-3 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-gray-200 before:to-transparent">
                {selectedLogs.map((log, index) => {
                  const logTime = log.time?.toDate
                    ? log.time.toDate()
                    : new Date(log.time);
                  return (
                    <div
                      key={index}
                      className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active"
                    >
                      <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-white bg-blue-100 text-blue-600 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                        {log.action === "CHECK_IN" ? (
                          <CheckCircle className="w-4 h-4 text-green-500" />
                        ) : (
                          <X className="w-4 h-4 text-orange-500" />
                        )}
                      </div>
                      <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-3 rounded-lg border border-gray-100 bg-white shadow-sm">
                        <div className="flex items-center justify-between space-x-2 mb-1">
                          <div className="font-bold text-gray-800 text-sm">
                            {log.action === "CHECK_IN"
                              ? "Check-In"
                              : "Check-Out"}
                          </div>
                          <time className="font-mono text-xs font-medium text-indigo-500">
                            {logTime.toLocaleTimeString("vi-VN")}
                          </time>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end">
              <button
                onClick={() => setSelectedLogs(null)}
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg text-sm font-medium hover:bg-gray-300 transition-colors"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Attendance;
