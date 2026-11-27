import {
  Activity,
  Award,
  BarChart3,
  Bell,
  BookOpenCheck,
  Building2,
  ClipboardList,
  FileSpreadsheet,
  HelpCircle,
  LayoutDashboard,
  LifeBuoy,
  ScrollText,
  Sliders,
  UserCircle,
  Users,
  UserCog,
  ShieldCheck,
} from 'lucide-react';

export const USER_ROLES = {
  SUPER_ADMIN: 'super-admin',
  ADMIN: 'admin',
  STUDENT: 'student',
};

export const ROLE_LABELS = {
  [USER_ROLES.SUPER_ADMIN]: 'Super Administrator',
  [USER_ROLES.ADMIN]: 'Examination Office Administrator',
  [USER_ROLES.STUDENT]: 'Candidate',
};

/**
 * ExamSphere is deployed exclusively for Dr. AIT. These details are the single
 * source of institutional information used across the UI.
 */
export const INSTITUTION = {
  name: 'Dr. Ambedkar Institute of Technology',
  shortName: 'Dr. AIT',
  code: '1DA',
  established: 1980,
  status: 'An Autonomous Institution affiliated to VTU, Belagavi',
  office: 'Office of the Controller of Examinations',
  academicYear: '2026–27',
  emailDomain: 'drait.edu.in',
  addressLines: ['BDA Outer Ring Road, Near Jnana Bharathi Campus,', 'Mallathahalli, Bengaluru, Karnataka – 560056'],
  examCentre: 'Central Computer Center (CCC), 2nd Floor, Dr. AIT Campus',
};

/**
 * Sidebar navigation per role. Student items address the existing
 * `/student?tab=…` views; every other path is a real route in AppRoutes.
 */
export const NAVIGATION_CONFIG = {
  [USER_ROLES.SUPER_ADMIN]: {
    title: 'Platform Administration · Dr. AIT',
    sections: [
      {
        title: 'Platform',
        items: [
          { label: 'Overview', path: '/super-admin', icon: LayoutDashboard },
          { label: 'Institution Profile', path: '/super-admin/organizations', icon: Building2 },
          { label: 'Admin Management', path: '/super-admin/admins', icon: ShieldCheck },
          { label: 'Staff Directory', path: '/super-admin/users', icon: UserCog },
          { label: 'System Monitoring', path: '/super-admin/monitoring', icon: Activity },
          { label: 'Activity Logs', path: '/super-admin/activity', icon: ScrollText },
          { label: 'Platform Settings', path: '/super-admin/settings', icon: Sliders },
        ],
      },
      {
        title: 'Examination Office',
        items: [
          { label: 'Admin Dashboard', path: '/admin', icon: BarChart3 },
          { label: 'Examinations', path: '/admin/exams', icon: FileSpreadsheet },
          { label: 'Question Bank', path: '/admin/questions', icon: HelpCircle },
          { label: 'Candidates', path: '/admin/students', icon: Users },
          { label: 'Results & Reports', path: '/admin/results', icon: ClipboardList },
        ],
      },
      {
        title: 'Account',
        items: [{ label: 'My Profile', path: '/super-admin/profile', icon: UserCircle }],
      },
    ],
  },
  [USER_ROLES.ADMIN]: {
    title: 'Examination Office',
    sections: [
      {
        title: 'Examinations',
        items: [
          { label: 'Dashboard', path: '/admin', icon: LayoutDashboard },
          { label: 'Question Bank', path: '/admin/questions', icon: HelpCircle },
          { label: 'Examinations', path: '/admin/exams', icon: FileSpreadsheet },
          { label: 'Candidates', path: '/admin/students', icon: Users },
          { label: 'Results & Reports', path: '/admin/results', icon: ClipboardList },
        ],
      },
      {
        title: 'Account',
        items: [
          { label: 'Notifications', path: '/admin/notifications', icon: Bell },
          { label: 'My Profile', path: '/admin/profile', icon: UserCircle },
        ],
      },
    ],
  },
  [USER_ROLES.STUDENT]: {
    title: 'Candidate Portal',
    sections: [
      {
        title: 'Examinations',
        items: [
          { label: 'Dashboard', tab: 'dashboard', icon: LayoutDashboard },
          { label: 'My Examinations', tab: 'exams', icon: BookOpenCheck },
          { label: 'Results & History', tab: 'results', icon: Award },
        ],
      },
      {
        title: 'Account',
        items: [
          { label: 'Notifications', tab: 'notifications', icon: Bell },
          { label: 'My Profile', tab: 'profile', icon: UserCircle },
          { label: 'Help & Support', tab: 'support', icon: LifeBuoy },
        ],
      },
    ],
  },
};

export const PROFILE_PATHS = {
  [USER_ROLES.SUPER_ADMIN]: '/super-admin/profile',
  [USER_ROLES.ADMIN]: '/admin/profile',
  [USER_ROLES.STUDENT]: '/student?tab=profile',
};

export const NOTIFICATION_PATHS = {
  [USER_ROLES.SUPER_ADMIN]: '/super-admin/activity',
  [USER_ROLES.ADMIN]: '/admin/notifications',
  [USER_ROLES.STUDENT]: '/student?tab=notifications',
};
