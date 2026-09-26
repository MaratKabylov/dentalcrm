export type BranchListItem = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  timezone: string;
  isActive: boolean;
  roomsCount: number;
  employeesCount: number;
};

export type BranchWorkingHour = {
  weekday: number;
  isWorking: boolean;
  startTime: string | null;
  endTime: string | null;
};

export type BranchRoom = {
  id: string;
  name: string;
  isActive: boolean;
};

export type BranchMemberAccess = {
  membershipId: string;
  userId: string;
  fullName: string;
  email: string;
  roleCode: string | null;
  roleName: string | null;
  hasAllBranchAccess: boolean;
  hasBranchAccess: boolean;
  isPrimary: boolean;
};

export type BranchManagementDetail = {
  branch: Omit<BranchListItem, "roomsCount" | "employeesCount">;
  workingHours: BranchWorkingHour[];
  rooms: BranchRoom[];
  members: BranchMemberAccess[];
  canManageRooms: boolean;
  canManageAccess: boolean;
  canManageAllBranchAccess: boolean;
};
