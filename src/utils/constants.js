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
} from 'lucide-react';

export const USER_ROLES = {
  SUPER_ADMIN: 'super-admin',
  ADMIN: 'admin',
  STUDENT: 'student',
};

export const ROLE_LABELS = {
  [USER_ROLES.SUPER_ADMIN]: 'Super Administrator',
  [USER_ROLES.ADMIN]: 'Institution Administrator',
  [USER_ROLES.STUDENT]: 'Candidate',
};

export const INSTITUTION = {
  name: 'Dr. Ambedkar Institute of Technology',
  shortName: 'Dr. AIT',
  office: 'Office of the Controller of Examinations',
  academicYear: '2026–27',
};

/**
 * Sidebar navigation per role. Student items address the existing
 * `/student?tab=…` views; every other path is a real route in AppRoutes.
 */
export const NAVIGATION_CONFIG = {
  [USER_ROLES.SUPER_ADMIN]: {
    title: 'Platform Administration',
    sections: [
      {
        title: 'Platform',
        items: [
          { label: 'Global Overview', path: '/super-admin', icon: LayoutDashboard },
          { label: 'Institutions', path: '/super-admin/organizations', icon: Building2 },
          { label: 'Users & Admins', path: '/super-admin/users', icon: UserCog },
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
