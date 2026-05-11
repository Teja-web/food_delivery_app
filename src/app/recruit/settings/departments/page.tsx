import { listDepartments } from "@/actions/departments";
import { DepartmentsClient } from "./DepartmentsList";

export default async function DepartmentsPage() {
  const { items: departments } = await listDepartments({ limit: 100 });
  return <DepartmentsClient initialDepartments={departments} />;
}
