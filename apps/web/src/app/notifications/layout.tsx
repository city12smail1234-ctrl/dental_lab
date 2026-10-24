import type { ReactNode } from 'react';
import { DoctorShell } from '@/components/DoctorShell';

export default function Layout({ children }: { children: ReactNode }) { return <DoctorShell>{children}</DoctorShell>; }
