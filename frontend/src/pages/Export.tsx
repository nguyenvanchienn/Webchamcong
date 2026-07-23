import React, { useState, useEffect } from "react";
import { FileSpreadsheet, Download } from "lucide-react";
import * as XLSX from "xlsx-js-style";
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  doc,
  getDoc,
} from "firebase/firestore";
import { db } from "../config/firebase";
import toast from "react-hot-toast";

const formatHours = (decimalHours: number) => {
  if (!decimalHours || decimalHours === 0) return "0 giờ 0 phút 0 giây";
  const totalSeconds = Math.round(decimalHours * 3600);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h} giờ ${m} phút ${s} giây`;
};

const applyStylesToSheet = (ws: XLSX.WorkSheet, boldKeywords: string[]) => {
  if (!ws["!ref"]) return;
  const range = XLSX.utils.decode_range(ws["!ref"]);

  // Style header row (Row 0)
  for (let C = range.s.c; C <= range.e.c; ++C) {
    const cellRef = XLSX.utils.encode_cell({ c: C, r: 0 });
    if (!ws[cellRef]) ws[cellRef] = { t: "s", v: "" };
    ws[cellRef].s = {
      font: { bold: true },
      fill: { fgColor: { rgb: "EFEFEF" } },
    };
  }

  // Style body rows containing keywords and apply auto-wrap to ALL body cells
  for (let R = 1; R <= range.e.r; ++R) {
    let isBoldRow = false;
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const cellRef = XLSX.utils.encode_cell({ c: C, r: R });
      const cell = ws[cellRef];
      if (
        cell &&
        typeof cell.v === "string" &&
        boldKeywords.some((kw) => cell.v.includes(kw))
      ) {
        isBoldRow = true;
        break;
      }
    }
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const cellRef = XLSX.utils.encode_cell({ c: C, r: R });
      if (!ws[cellRef]) ws[cellRef] = { t: "s", v: "" };
      if (!ws[cellRef].s) ws[cellRef].s = {};

      ws[cellRef].s.alignment = { wrapText: true, vertical: "top" };

      if (isBoldRow) {
        ws[cellRef].s.font = { bold: true };
      }
    }
  }
};

const Export: React.FC = () => {
  const [month, setMonth] = useState<string>(
    new Date().toISOString().slice(0, 7),
  );
  const [exporting, setExporting] = useState(false);
  const userRole = localStorage.getItem("userRole");
  const currentUserBranchId = localStorage.getItem("branchId");
  const currentEmployeeId = localStorage.getItem("employeeId") || "";
  const isManager = userRole === "SUPER_ADMIN" || userRole === "BRANCH_ADMIN";

  const [filterBranchId, setFilterBranchId] = useState(
    userRole === "BRANCH_ADMIN" ? currentUserBranchId || "ALL" : "ALL",
  );
  const [branches, setBranches] = useState<any[]>([]);
  const [payrollExportMode, setPayrollExportMode] = useState<
    "PERSONAL" | "ALL"
  >(isManager ? "PERSONAL" : "PERSONAL");

  useEffect(() => {
    const fetchBranches = async () => {
      try {
        if (userRole === "SUPER_ADMIN") {
          const snap = await getDocs(collection(db, "branches"));
          const list: any[] = [];
          snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
          setBranches(list);
          return;
        }

        if (userRole === "BRANCH_ADMIN" && currentUserBranchId) {
          const branchSnap = await getDoc(
            doc(db, "branches", currentUserBranchId),
          );
          if (branchSnap.exists()) {
            setBranches([{ id: branchSnap.id, ...branchSnap.data() }]);
          }
        }
      } catch (err) {
        console.error(err);
      }
    };
    fetchBranches();
  }, [userRole, currentUserBranchId]);

  useEffect(() => {
    if (!isManager) setPayrollExportMode("PERSONAL");
  }, [isManager]);

  const handleExport = async () => {
    setExporting(true);
    try {
      if (payrollExportMode === "PERSONAL" && !currentEmployeeId) {
        toast.error(
          "Không tìm thấy tài khoản nhân viên hiện tại để xuất lương cá nhân!",
        );
        return;
      }

      // 1. Get employees
      const empSnap = await getDocs(collection(db, "employees"));
      const employees: Record<string, any> = {};
      empSnap.forEach((d) => {
        const data = d.data();

        if (payrollExportMode === "PERSONAL") {
          if (d.id !== currentEmployeeId) return;
        } else {
          if (
            userRole === "BRANCH_ADMIN" &&
            data.branchId !== currentUserBranchId
          )
            return;
          if (
            userRole === "SUPER_ADMIN" &&
            filterBranchId !== "ALL" &&
            data.branchId !== filterBranchId
          )
            return;
        }

        employees[d.id] = { id: d.id, ...data };
      });

      // 2. Get attendance for the selected month
      const [year, m] = month.split("-");
      const startDate = `${year}-${m}-01`;
      const endDate = new Date(
        parseInt(year),
        parseInt(m),
        0,
      ).toLocaleDateString("en-CA");

      const attQuery = query(
        collection(db, "attendance"),
        where("date", ">=", startDate),
        where("date", "<=", endDate),
      );
      const attSnap = await getDocs(attQuery);

      // 2.5 Get Bonuses
      const bonusQuery = query(
        collection(db, "bonuses"),
        where("month", "==", month),
      );
      const bonusSnap = await getDocs(bonusQuery);

      const summary: Record<string, any> = {};

      Object.values(employees).forEach((emp) => {
        summary[emp.id] = {
          rawId: emp.id,
          id: emp.employeeCode || emp.id,
          name: emp.fullName,
          role: emp.position || "Nhân viên",
          branch: emp.branchName,
          salaryPerHour: emp.salaryPerHour || 0,
          totalHours: 0,
          totalShifts: 0,
          totalEarned: 0,
          bonus: 0,
          penalty: 0,
        };
      });

      // 2.6 Get Schedules
      const schQuery = query(
        collection(db, "schedules"),
        where("date", ">=", startDate),
        where("date", "<=", endDate),
      );
      const schSnap = await getDocs(schQuery);

      // 3. Format data into a single sheet
      const excelData: any[] = [];
      let stt = 1;
      const branchSummary: Record<
        string,
        { salary: number; bonus: number; penalty: number; net: number }
      > = {};
      let totalSalaryAll = 0;
      let totalBonusAll = 0;
      let totalPenaltyAll = 0;
      let totalNetAll = 0;

      const sortedEmployees = Object.values(summary).sort((a, b) => {
        const branchA = a.branch || "";
        const branchB = b.branch || "";
        if (branchA !== branchB) {
          return branchA.localeCompare(branchB);
        }
        return (a.name || "").localeCompare(b.name || "");
      });

      sortedEmployees.forEach((emp) => {
        let employeeTotalHours = 0;
        let employeeTotalEarned = 0;
        let employeeTotalBonus = 0;
        let employeeTotalPenalty = 0;

        // Get Attendance and Schedules for this employee
        const empAtts = attSnap.docs
          .map((d) => d.data())
          .filter((d) => d.employeeId === emp.rawId);

        const empSchs = schSnap.docs
          .map((d) => d.data())
          .filter((d) => d.employeeId === emp.rawId);

        // Group by Date
        const datesSet = new Set([
          ...empAtts.map((a) => a.date),
          ...empSchs.map((s) => s.date),
        ]);
        const sortedDates = Array.from(datesSet).sort();

        sortedDates.forEach((date) => {
          const attsOnDate = empAtts.filter((a) => a.date === date);
          const schsOnDate = empSchs.filter((s) => s.date === date);

          if (attsOnDate.length > 0) {
            attsOnDate.forEach((data) => {
              const inTime = data.checkIn ? data.checkIn.toDate() : null;
              const outTime = data.checkOut ? data.checkOut.toDate() : null;
              let hours = 0;
              let earned = 0;
              if (inTime && outTime) {
                hours =
                  (outTime.getTime() - inTime.getTime()) / (1000 * 60 * 60);
                earned = Math.round(hours * emp.salaryPerHour);
                employeeTotalHours += hours;
                employeeTotalEarned += earned;
              }

              let status = "Không có mặt";
              if (inTime && outTime) status = "Hoàn thành";
              else if (inTime) status = "Đang làm / Chưa checkout";

              if (data.logs && data.logs.length > 3)
                status += " (Có ngắt quãng)";

              excelData.push({
                STT: stt,
                "Mã NV": emp.id,
                "Họ và Tên": emp.name,
                "Chức vụ": emp.role,
                "Cơ sở": emp.branch || "",
                "Phân loại": "Ca làm việc",
                Ngày: date,
                "Check In": inTime ? inTime.toLocaleString("vi-VN") : "",
                "Check Out": outTime ? outTime.toLocaleString("vi-VN") : "",
                "Số giờ": inTime && outTime ? formatHours(hours) : "",
                "Mức lương (VNĐ/h)": "",
                "Thành tiền (VNĐ)":
                  earned > 0
                    ? new Intl.NumberFormat("vi-VN").format(earned)
                    : "",
                "Trạng thái / Lý do": status,
              });
            });
          } else if (schsOnDate.length > 0) {
            // Scheduled but no attendance = Absent
            schsOnDate.forEach(() => {
              excelData.push({
                STT: stt,
                "Mã NV": emp.id,
                "Họ và Tên": emp.name,
                "Chức vụ": emp.role,
                "Cơ sở": emp.branch || "",
                "Phân loại": "Ca làm việc",
                Ngày: date,
                "Check In": "",
                "Check Out": "",
                "Số giờ": "0 giờ 0 phút 0 giây",
                "Mức lương (VNĐ/h)": "",
                "Thành tiền (VNĐ)": "0",
                "Trạng thái / Lý do": "Vắng mặt",
              });
            });
          }
        });

        // Bonus/Penalty Rows
        const empBonuses = bonusSnap.docs
          .map((d) => d.data())
          .filter((b) => b.employeeId === emp.rawId);

        empBonuses.forEach((b) => {
          const isPenalty = b.type === "DEDUCT";
          const amt = b.amount || 0;
          if (isPenalty) employeeTotalPenalty += amt;
          else employeeTotalBonus += amt;

          excelData.push({
            STT: stt,
            "Mã NV": emp.id,
            "Họ và Tên": emp.name,
            "Chức vụ": emp.role,
            "Cơ sở": emp.branch || "",
            "Phân loại": isPenalty ? "Phạt" : "Thưởng",
            Ngày: b.createdAt?.toDate
              ? b.createdAt.toDate().toLocaleDateString("vi-VN")
              : "",
            "Check In": "",
            "Check Out": "",
            "Số giờ": "",
            "Mức lương (VNĐ/h)": "",
            "Thành tiền (VNĐ)":
              (isPenalty ? "-" : "+") +
              new Intl.NumberFormat("vi-VN").format(amt),
            "Trạng thái / Lý do": b.reason || "",
          });
        });

        // TỔNG KẾT Row
        const employeeSalary = Math.round(employeeTotalEarned);
        const employeeNet = Math.round(
          employeeTotalEarned + employeeTotalBonus - employeeTotalPenalty,
        );

        excelData.push({
          STT: stt,
          "Mã NV": emp.id,
          "Họ và Tên": emp.name,
          "Chức vụ": emp.role,
          "Cơ sở": emp.branch || "",
          "Phân loại": "TỔNG KẾT THÁNG",
          Ngày: "",
          "Check In": "",
          "Check Out": "",
          "Số giờ": formatHours(employeeTotalHours),
          "Mức lương (VNĐ/h)": new Intl.NumberFormat("vi-VN").format(
            emp.salaryPerHour,
          ),
          "Thành tiền (VNĐ)": new Intl.NumberFormat("vi-VN").format(
            employeeNet,
          ),
          "Trạng thái / Lý do": `Lương: ${new Intl.NumberFormat("vi-VN").format(employeeSalary)}, Thưởng: ${new Intl.NumberFormat("vi-VN").format(employeeTotalBonus)}, Phạt: ${new Intl.NumberFormat("vi-VN").format(employeeTotalPenalty)}`,
        });

        if (payrollExportMode === "ALL") {
          const branchName = emp.branch || "Chưa rõ";
          if (!branchSummary[branchName]) {
            branchSummary[branchName] = {
              salary: 0,
              bonus: 0,
              penalty: 0,
              net: 0,
            };
          }
          branchSummary[branchName].salary += employeeSalary;
          branchSummary[branchName].bonus += employeeTotalBonus;
          branchSummary[branchName].penalty += employeeTotalPenalty;
          branchSummary[branchName].net += employeeNet;

          totalSalaryAll += employeeSalary;
          totalBonusAll += employeeTotalBonus;
          totalPenaltyAll += employeeTotalPenalty;
          totalNetAll += employeeNet;
        }

        stt++; // Increment STT for the next employee

        // Empty row for spacing
        excelData.push({
          STT: "",
          "Mã NV": "",
          "Họ và Tên": "",
          "Chức vụ": "",
          "Cơ sở": "",
          "Phân loại": "",
          Ngày: "",
          "Check In": "",
          "Check Out": "",
          "Số giờ": "",
          "Mức lương (VNĐ/h)": "",
          "Thành tiền (VNĐ)": "",
          "Trạng thái / Lý do": "",
        });
      });

      if (payrollExportMode === "ALL") {
        // Spacer before summary block
        excelData.push({
          STT: "",
          "Mã NV": "",
          "Họ và Tên": "",
          "Chức vụ": "",
          "Cơ sở": "",
          "Phân loại": "",
          Ngày: "",
          "Check In": "",
          "Check Out": "",
          "Số giờ": "",
          "Mức lương (VNĐ/h)": "",
          "Thành tiền (VNĐ)": "",
          "Trạng thái / Lý do": "",
        });

        Object.keys(branchSummary)
          .sort((a, b) => a.localeCompare(b))
          .forEach((branchName) => {
            const item = branchSummary[branchName];
            excelData.push({
              STT: "",
              "Mã NV": "",
              "Họ và Tên": "",
              "Chức vụ": "",
              "Cơ sở": branchName,
              "Phân loại": "TỔNG CƠ SỞ",
              Ngày: "",
              "Check In": "",
              "Check Out": "",
              "Số giờ": "",
              "Mức lương (VNĐ/h)": "",
              "Thành tiền (VNĐ)": new Intl.NumberFormat("vi-VN").format(
                item.net,
              ),
              "Trạng thái / Lý do": `Lương: ${new Intl.NumberFormat("vi-VN").format(item.salary)}, Thưởng: ${new Intl.NumberFormat("vi-VN").format(item.bonus)}, Phạt: ${new Intl.NumberFormat("vi-VN").format(item.penalty)}`,
            });
          });

        if (Object.keys(branchSummary).length > 1 || filterBranchId === "ALL") {
          excelData.push({
            STT: "",
            "Mã NV": "",
            "Họ và Tên": "",
            "Chức vụ": "",
            "Cơ sở": "TẤT CẢ CƠ SỞ",
            "Phân loại": "TỔNG TOÀN HỆ THỐNG",
            Ngày: "",
            "Check In": "",
            "Check Out": "",
            "Số giờ": "",
            "Mức lương (VNĐ/h)": "",
            "Thành tiền (VNĐ)": new Intl.NumberFormat("vi-VN").format(
              totalNetAll,
            ),
            "Trạng thái / Lý do": `Lương: ${new Intl.NumberFormat("vi-VN").format(totalSalaryAll)}, Thưởng: ${new Intl.NumberFormat("vi-VN").format(totalBonusAll)}, Phạt: ${new Intl.NumberFormat("vi-VN").format(totalPenaltyAll)}`,
          });
        }
      }

      if (excelData.length === 0) {
        toast.error("Không có dữ liệu để xuất trong tháng này!");
        setExporting(false);
        return;
      }

      // 4. Create Workbook
      const workbook = XLSX.utils.book_new();

      const worksheet = XLSX.utils.json_to_sheet(excelData);
      worksheet["!cols"] = [
        { wch: 5 }, // STT
        { wch: 15 }, // Mã NV
        { wch: 25 }, // Tên
        { wch: 15 }, // Chức vụ
        { wch: 20 }, // Cơ sở
        { wch: 20 }, // Phân loại
        { wch: 15 }, // Ngày
        { wch: 25 }, // Check in
        { wch: 25 }, // Check out
        { wch: 25 }, // Số giờ
        { wch: 15 }, // Mức lương
        { wch: 20 }, // Tiền
        { wch: 50 }, // Trạng thái/Lý do
      ];
      applyStylesToSheet(worksheet, [
        "TỔNG KẾT THÁNG",
        "TỔNG CƠ SỞ",
        "TỔNG TOÀN HỆ THỐNG",
      ]);
      XLSX.utils.book_append_sheet(workbook, worksheet, `Tổng hợp`);

      const personalEmployee =
        payrollExportMode === "PERSONAL"
          ? (Object.values(employees)[0] as any)
          : null;

      const fileName =
        payrollExportMode === "PERSONAL"
          ? `Bang_Luong_Ca_Nhan_${personalEmployee?.employeeCode || personalEmployee?.id || "NhanVien"}_${m}_${year}.xlsx`
          : `Bang_Luong_Toan_Bo_${m}_${year}.xlsx`;

      XLSX.writeFile(workbook, fileName);
      toast.success("Xuất file thành công!");
    } catch (error) {
      console.error(error);
      toast.error("Có lỗi xảy ra khi xuất file!");
    } finally {
      setExporting(false);
    }
  };

  const [exportingRevenue, setExportingRevenue] = useState(false);

  const handleExportRevenue = async () => {
    setExportingRevenue(true);
    try {
      if (!month) {
        toast.error("Vui lòng chọn tháng cần xuất!");
        return;
      }

      const [year, m] = month.split("-");
      const startOfMonth = new Date(parseInt(year), parseInt(m) - 1, 1);
      const endOfMonth = new Date(parseInt(year), parseInt(m), 1);

      // Fetch Orders
      const ordersQuery = query(
        collection(db, "orders"),
        orderBy("createdAt", "desc"),
      );
      const ordersSnap = await getDocs(ordersQuery);

      const branchMap: Record<string, string> = {};
      branches.forEach((b) => {
        branchMap[b.id] = b.name;
      });

      const rawData: any[] = [];

      ordersSnap.forEach((doc) => {
        const data = doc.data();
        if (!data.createdAt) return;

        const orderDate = data.createdAt.toDate
          ? data.createdAt.toDate()
          : new Date(data.createdAt);
        if (orderDate >= startOfMonth && orderDate < endOfMonth) {
          if (filterBranchId !== "ALL" && data.branchId !== filterBranchId)
            return;

          const isExpense = data.type === "EXPENSE";
          const itemsStr = data.items
            ? data.items
                .map((i: any) => `${i.name} (x${i.quantity})`)
                .join(", ")
            : "";
          const content = isExpense ? data.note || itemsStr : itemsStr;
          const amount = data.totalAmount || 0;
          const branchName =
            data.branchName ||
            (data.branchId ? branchMap[data.branchId] || "Chưa rõ" : "Chưa rõ");

          const cashierOutput = data.cashierEmail || "";

          rawData.push({
            id: doc.id,
            orderCode: data.orderCode,
            branchName,
            isExpense,
            orderDate,
            cashier: cashierOutput,
            paymentMethod:
              data.paymentMethod === "TRANSFER" ? "Chuyển khoản" : "Tiền mặt",
            content,
            amount,
          });
        }
      });

      // Fetch salaries to include as expenses
      const empSnap = await getDocs(collection(db, "employees"));
      const employees: Record<string, any> = {};
      empSnap.forEach((d) => {
        employees[d.id] = { id: d.id, ...d.data() };
      });

      const startDateStr = `${year}-${m}-01`;
      const endDateStr = new Date(
        parseInt(year),
        parseInt(m),
        0,
      ).toLocaleDateString("en-CA");

      const attSnap = await getDocs(
        query(
          collection(db, "attendance"),
          where("date", ">=", startDateStr),
          where("date", "<=", endDateStr),
        ),
      );
      const bonusSnap = await getDocs(
        query(collection(db, "bonuses"), where("month", "==", month)),
      );

      Object.values(employees).forEach((emp) => {
        let earned = 0;
        let bonus = 0;
        let penalty = 0;

        const empAtts = attSnap.docs
          .map((d) => d.data())
          .filter((d) => d.employeeId === emp.id);
        empAtts.forEach((data) => {
          const inTime = data.checkIn ? data.checkIn.toDate() : null;
          const outTime = data.checkOut ? data.checkOut.toDate() : null;
          if (inTime && outTime) {
            const hours =
              (outTime.getTime() - inTime.getTime()) / (1000 * 60 * 60);
            earned += Math.round(hours * Number(emp.salaryPerHour || 0));
          }
        });

        const empBonuses = bonusSnap.docs
          .map((d) => d.data())
          .filter((b) => b.employeeId === emp.id);
        empBonuses.forEach((b) => {
          if (b.type === "DEDUCT") penalty += Number(b.amount || 0);
          else bonus += Number(b.amount || 0);
        });

        const currentUserEmail = localStorage.getItem("userEmail") || "";
        let currentUserName = currentUserEmail || "Admin";
        if (currentUserEmail) {
          for (const employee of Object.values(employees)) {
            if (employee.email === currentUserEmail) {
              currentUserName = employee.fullName || currentUserName;
              break;
            }
          }
        }

        const netSalary = Math.round(earned + bonus - penalty);

        if (netSalary > 0) {
          const bName =
            emp.branchName ||
            (emp.branchId ? branchMap[emp.branchId] : null) ||
            "Chưa rõ";
          const isMatch =
            filterBranchId === "ALL" ||
            emp.branchId === filterBranchId ||
            bName === branchMap[filterBranchId];
          if (isMatch) {
            rawData.push({
              id: `SALARY-${emp.id}`,
              orderCode: `LƯƠNG-${emp.employeeCode || emp.id}`,
              branchName: bName,
              isExpense: true,
              orderDate: new Date(),
              cashier: currentUserName,
              paymentMethod: "Chuyển khoản",
              content: `Chi phí lương: ${emp.fullName}`,
              amount: netSalary,
            });
          }
        }
      });

      if (rawData.length === 0) {
        toast.error("Không có dữ liệu doanh thu trong tháng này!");
        setExportingRevenue(false);
        return;
      }

      // Group by branch
      const branchGroups: Record<string, typeof rawData> = {};
      rawData.forEach((row) => {
        if (!branchGroups[row.branchName]) branchGroups[row.branchName] = [];
        branchGroups[row.branchName].push(row);
      });

      const excelData: any[] = [];
      let stt = 1;
      let totalAllIncome = 0;
      let totalAllExpense = 0;

      Object.keys(branchGroups)
        .sort()
        .forEach((bName) => {
          let branchIncome = 0;
          let branchExpense = 0;

          const sortedBranchRows = branchGroups[bName].sort(
            (a, b) => a.orderDate.getTime() - b.orderDate.getTime(),
          );

          sortedBranchRows.forEach((row) => {
            if (row.isExpense) branchExpense += row.amount;
            else branchIncome += row.amount;

            excelData.push({
              STT: stt++,
              "Mã GD": row.orderCode || row.id,
              "Cơ sở": bName,
              Loại: row.isExpense ? "Chi" : "Thu",
              "Ngày giờ": row.orderDate.toLocaleString("vi-VN"),
              "Thu ngân": row.cashier,
              "Hình thức": row.paymentMethod,
              "Nội dung": row.content,
              "Số tiền (VNĐ)":
                (row.isExpense ? "-" : "+") +
                new Intl.NumberFormat("vi-VN").format(row.amount),
            });
          });

          totalAllIncome += branchIncome;
          totalAllExpense += branchExpense;

          excelData.push({
            STT: "",
            "Mã GD": "",
            "Cơ sở": bName,
            Loại: "TỔNG CƠ SỞ",
            "Ngày giờ": "",
            "Thu ngân": "",
            "Hình thức": "",
            "Nội dung": `Tổng thu: ${new Intl.NumberFormat("vi-VN").format(branchIncome)} - Tổng chi: ${new Intl.NumberFormat("vi-VN").format(branchExpense)}`,
            "Số tiền (VNĐ)": new Intl.NumberFormat("vi-VN").format(
              branchIncome - branchExpense,
            ),
          });

          excelData.push({
            STT: "",
            "Mã GD": "",
            "Cơ sở": "",
            Loại: "",
            "Ngày giờ": "",
            "Thu ngân": "",
            "Hình thức": "",
            "Nội dung": "",
            "Số tiền (VNĐ)": "",
          });
        });

      if (filterBranchId === "ALL") {
        excelData.push({
          STT: "",
          "Mã GD": "",
          "Cơ sở": "TẤT CẢ CƠ SỞ",
          Loại: "TỔNG CỘNG",
          "Ngày giờ": "",
          "Thu ngân": "",
          "Hình thức": "",
          "Nội dung": `Tổng doanh thu: ${new Intl.NumberFormat("vi-VN").format(totalAllIncome)} - Tổng chi phí: ${new Intl.NumberFormat("vi-VN").format(totalAllExpense)}`,
          "Số tiền (VNĐ)": new Intl.NumberFormat("vi-VN").format(
            totalAllIncome - totalAllExpense,
          ),
        });
      }

      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet(excelData);
      worksheet["!cols"] = [
        { wch: 5 }, // STT
        { wch: 15 }, // Mã GD
        { wch: 20 }, // Cơ sở
        { wch: 10 }, // Loại
        { wch: 20 }, // Ngày giờ
        { wch: 25 }, // Thu ngân
        { wch: 15 }, // Hình thức
        { wch: 60 }, // Nội dung
        { wch: 20 }, // Số tiền
      ];
      applyStylesToSheet(worksheet, ["TỔNG CƠ SỞ", "TỔNG CỘNG"]);
      XLSX.utils.book_append_sheet(workbook, worksheet, `Doanh thu`);

      XLSX.writeFile(workbook, `Doanh_Thu_Thang_${m}_${year}.xlsx`);
      toast.success("Xuất báo cáo doanh thu thành công!");
    } catch (error) {
      console.error(error);
      toast.error("Có lỗi xảy ra khi xuất báo cáo doanh thu!");
    } finally {
      setExportingRevenue(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <h2 className="text-xl font-bold text-gray-800 flex items-center">
          <FileSpreadsheet className="mr-2 text-green-600" /> Xuất Dữ Liệu
          (Excel)
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          {isManager
            ? "Xuất bảng lương cá nhân, bảng lương toàn bộ nhân viên và báo cáo tài chính."
            : "Xuất bảng lương chi tiết cá nhân theo tháng."}
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 max-w-2xl mx-auto flex flex-col items-center">
        <div className="p-5 bg-green-50 rounded-full mb-6">
          <FileSpreadsheet size={48} className="text-green-500" />
        </div>

        <div className="w-full max-w-sm space-y-4 text-center">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 text-left">
              Chọn tháng xuất dữ liệu
            </label>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg outline-none focus:border-green-500 text-gray-700 font-medium bg-gray-50 text-center"
            />
          </div>

          {isManager && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 text-left">
                Chế độ xuất bảng lương
              </label>
              <select
                value={payrollExportMode}
                onChange={(e) =>
                  setPayrollExportMode(e.target.value as "PERSONAL" | "ALL")
                }
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg outline-none focus:border-green-500 text-gray-700 font-medium bg-gray-50 text-center"
              >
                <option value="PERSONAL">Bảng lương cá nhân của tôi</option>
                <option value="ALL">Bảng lương toàn bộ nhân viên</option>
              </select>
            </div>
          )}

          {userRole === "SUPER_ADMIN" && payrollExportMode === "ALL" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 text-left">
                Chọn cơ sở xuất dữ liệu
              </label>
              <select
                value={filterBranchId}
                onChange={(e) => setFilterBranchId(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg outline-none focus:border-green-500 text-gray-700 font-medium bg-gray-50 text-center"
              >
                <option value="ALL">Tất cả cơ sở</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex flex-col gap-3">
            <button
              onClick={handleExport}
              disabled={exporting || exportingRevenue}
              className={`w-full py-3 rounded-xl font-bold text-white shadow-sm transition-all flex justify-center items-center ${
                exporting
                  ? "bg-green-400 cursor-not-allowed"
                  : "bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700"
              }`}
            >
              {exporting ? (
                "Đang xử lý..."
              ) : (
                <>
                  <Download size={20} className="mr-2" />
                  {payrollExportMode === "PERSONAL"
                    ? "Xuất bảng lương cá nhân"
                    : "Xuất bảng lương toàn bộ"}
                </>
              )}
            </button>

            {isManager && (
              <button
                onClick={handleExportRevenue}
                disabled={exporting || exportingRevenue}
                className={`w-full py-3 rounded-xl font-bold text-white shadow-sm transition-all flex justify-center items-center ${
                  exportingRevenue
                    ? "bg-blue-400 cursor-not-allowed"
                    : "bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700"
                }`}
              >
                {exportingRevenue ? (
                  "Đang xử lý..."
                ) : (
                  <>
                    <Download size={20} className="mr-2" />
                    {userRole === "BRANCH_ADMIN"
                      ? "Xuất báo cáo tài chính cơ sở"
                      : "Xuất báo cáo Doanh Thu"}
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Export;
