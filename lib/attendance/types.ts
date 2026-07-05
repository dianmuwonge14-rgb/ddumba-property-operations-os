import type { Database } from "@/types/database.types";
import type { Company, Office } from "@/lib/auth/types";

export type AttendanceEventRow = Database["public"]["Tables"]["attendance_events"]["Row"];
export type AttendanceEventInsert = Database["public"]["Tables"]["attendance_events"]["Insert"];
export type EmployeeRow = Database["public"]["Tables"]["employees"]["Row"];
export type UserRow = Database["public"]["Tables"]["users"]["Row"];
export type WorkScheduleRow = Database["public"]["Tables"]["work_schedules"]["Row"];
export type PublicHolidayRow = Database["public"]["Tables"]["public_holidays"]["Row"];
export type UserDeviceRow = Database["public"]["Tables"]["user_devices"]["Row"];
export type GpsValidationRow = Database["public"]["Tables"]["gps_validations"]["Row"];
export type GeofenceRow = Database["public"]["Tables"]["geofences"]["Row"];

export type AttendanceEventType = "check_in" | "start_break" | "end_break" | "check_out";

export type AttendanceKpis = {
    presentToday: number;
    notCheckedInToday: number;
    lateToday: number;
    absentToday: number;
    checkedOutToday: number;
    totalHoursWorked: number;
    officeAttendanceRate: number;
    officeAttendanceScore: number;
    employeeAttendanceRate: number;
    monthlyAttendanceScore: number;
    overtimeHours: number;
};

export type EmployeeAttendanceProfile = EmployeeRow & {
    userName: string | null;
    userEmail: string | null;
    todayStatus: "not_started" | "present" | "late" | "absent" | "on_break" | "checked_out";
    firstCheckIn: string | null;
    lastCheckOut: string | null;
    breakMinutes: number;
    workedMinutes: number;
    lateMinutes: number;
    monthPresentDays: number;
    monthLateDays: number;
    monthAbsentDays: number;
    attendanceRate: number;
};

export type DailyAttendanceRow = {
    employee: EmployeeAttendanceProfile;
    events: AttendanceEventRow[];
    expectedClockIn: string;
    lateAfter: string;
    absentAfter: string;
};

export type AttendanceTimelineItem = AttendanceEventRow & {
    employeeName: string | null;
    deviceName: string | null;
    gpsPassed: boolean | null;
};

export type AttendancePageData = {
    company: Company | null;
    office: Office | null;
    employees: EmployeeAttendanceProfile[];
    events: AttendanceTimelineItem[];
    ledger: DailyAttendanceRow[];
    schedules: WorkScheduleRow[];
    holidays: PublicHolidayRow[];
    devices: UserDeviceRow[];
    kpis: AttendanceKpis;
    dailyReport: OfficeDailyReportStatus;
    dailyReportDefaults: OfficeDailyReportDefaults;
    payroll: PayrollReportRow[];
};

export type AttendanceActionInput = {
    employeeId: string;
    officeId?: string;
    eventType: AttendanceEventType;
    pin?: string;
    latitude?: number;
    longitude?: number;
    deviceFingerprint?: string;
    deviceName?: string;
    platform?: string;
};

export type OfficeDailyReportStatus = {
    submitted: boolean;
    reportId: string | null;
    submittedAt: string | null;
};

export type OfficeDailyReportDefaults = {
    reportDate: string;
    totalCollections: number;
    totalExpenses: number;
    landlordPayments: number;
    vacantRooms: number;
    newTenants: number;
    brokenPromises: number;
};

export type OfficeDailyReportInput = OfficeDailyReportDefaults & {
    challengesFaced: string;
    generalOfficeNotes: string;
};

export type PayrollReportRow = {
    employeeId: string;
    employeeName: string;
    officeName: string;
    daysPresent: number;
    daysLate: number;
    daysAbsent: number;
    totalHoursWorked: number;
    overtimeHours: number;
    attendanceScore: number;
};
