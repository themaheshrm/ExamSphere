import {
  ShieldCheck,
  Building2,
  Sliders,
  LayoutDashboard,
  FileSpreadsheet,
  HelpCircle,
  Users,
  GraduationCap,
  BookOpenCheck,
  Award,
  Clock,
  Settings
} from 'lucide-react';

export const USER_ROLES = {
  SUPER_ADMIN: 'super-admin',
  ADMIN: 'admin',
  STUDENT: 'student',
};

export const NAVIGATION_CONFIG = {
  [USER_ROLES.SUPER_ADMIN]: {
    title: 'Super Admin Portal',
    badge: 'Enterprise Root',
    badgeColor: 'bg-purple-100 text-purple-700 border-purple-200',
    navItems: [
      {
        label: 'System Overview',
        path: '/super-admin',
        icon: LayoutDashboard,
      },
      {
        label: 'Institutions',
        path: '/super-admin/organizations',
        icon: Building2,
      },
      {
        label: 'Platform Settings',
        path: '/super-admin/settings',
        icon: Sliders,
      },
    ],
  },
  [USER_ROLES.ADMIN]: {
    title: 'Admin Control Center',
    badge: 'Staff Access',
    badgeColor: 'bg-blue-100 text-blue-700 border-blue-200',
    navItems: [
      {
        label: 'Dashboard',
        path: '/admin',
        icon: LayoutDashboard,
      },
      {
        label: 'Exam Management',
        path: '/admin/exams',
        icon: FileSpreadsheet,
      },
      {
        label: 'Question Bank',
        path: '/admin/questions',
        icon: HelpCircle,
      },
      {
        label: 'Student Candidates',
        path: '/admin/students',
        icon: Users,
      },
    ],
  },
  [USER_ROLES.STUDENT]: {
    title: 'Student CBT Portal',
    badge: 'Candidate Area',
    badgeColor: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    navItems: [
      {
        label: 'My Dashboard',
        path: '/student',
        icon: LayoutDashboard,
      },
      {
        label: 'Available Exams',
        path: '/student/exams',
        icon: BookOpenCheck,
      },
      {
        label: 'CBT Exam Simulator',
        path: '/student/exam-preview',
        icon: Clock,
      },
      {
        label: 'Results & Reports',
        path: '/student/results',
        icon: Award,
      },
    ],
  },
};
