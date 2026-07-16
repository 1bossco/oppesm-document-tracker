import { backendGet } from "@/lib/sheet";

export interface StaffMember {
  name: string;
  employeeNo: string;
  position: string;
  contact: string;
  email: string;
  status: string;
}

interface StaffRow {
  name?: string;
  employeeNo?: string;
  position?: string;
  contact?: string;
  email?: string;
  status?: string;
}

// Sample directory for local preview (from the OPPESM staff list). Kept in a
// "Staff Directory" sheet in production so the roster can be edited without code.
export const sampleStaff: StaffMember[] = [
  { name: "Anillo, Kevin Morales", employeeNo: "30009977", position: "LEO III", contact: "0912-368-7504", email: "kevinanillo09@gmail.com", status: "Permanent" },
  { name: "Bacala, John-John Bato", employeeNo: "30000295", position: "RMO III", contact: "0930-336-5355", email: "", status: "Permanent" },
  { name: "Balbuena, Francis San Diego", employeeNo: "10011664", position: "LEO II", contact: "0927-153-2758", email: "francisbalbuena1998@gmail.com", status: "Permanent" },
  { name: "Basalo, Maria Eva Malinao", employeeNo: "30000299", position: "PESO MANAGER", contact: "0946-718-8081", email: "mariaevabasalo22@gmail.com", status: "Permanent" },
  { name: "Cadungog, Sweetsel Guarin", employeeNo: "210010691", position: "LEO III", contact: "0948-651-6128", email: "sweetselgc@gmail.com", status: "Permanent" },
  { name: "Concepcion, Liza Enriquez", employeeNo: "300010996", position: "Supervising LEO", contact: "0995-254-3364", email: "lizaeconcepcion@gmail.com", status: "Permanent" },
  { name: "Ferrer, Patricia Mae Dadural", employeeNo: "300000001", position: "C.O. I", contact: "0905-435-9257", email: "patriciamaedadural88@gmail.com", status: "Permanent" },
  { name: "Del Mundo, Erwel Martin", employeeNo: "350011948", position: "BB II", contact: "0938-043-2397 / 0919-067-8917", email: "emartindelmundo@gmail.com", status: "Permanent" },
  { name: "Masamoc, Ariel Apigo", employeeNo: "30000302", position: "Senior LEO", contact: "0930-400-1461", email: "arielmasamoc8869@gmail.com", status: "Permanent" },
  { name: "Recio, Jinky Larion", employeeNo: "30009596", position: "C.O. III", contact: "0953-126-2528 / 0977-465-0545", email: "recio.jinky@gmail.com", status: "Permanent" },
  { name: "Soriano, Rovinnel Manuel", employeeNo: "30009595", position: "LEO III", contact: "0909-491-2214", email: "rovinnelsoriano5@gmail.com", status: "Permanent" },
  { name: "Trajano, Mary Jane Vitug", employeeNo: "30000301", position: "C.O. III", contact: "0912-477-6655", email: "trajanomaryjane@gmail.com", status: "Permanent" },
  { name: "Villaruz, Ruth De Gollo", employeeNo: "14009829", position: "BB II", contact: "0939-627-0504", email: "villaruzruth1982@yahoo.com", status: "Permanent" },
  { name: "Ambrocio, Carl Kevin Cruz", employeeNo: "300013360", position: "Admin. Aide IV", contact: "0969-411-7792", email: "carlambrocio0@gmail.com", status: "Job Order" },
  { name: "Cruz, Mark Lester De Jesus", employeeNo: "60010471", position: "LEO II", contact: "0917-457-3655", email: "mrklstrcruz@gmail.com", status: "Job Order" },
];

/** The staff roster for the assignment picker. */
export async function getStaff(): Promise<StaffMember[]> {
  const rows = await backendGet<StaffRow[]>("staff");
  if (!rows) return sampleStaff;

  const staff = rows
    .map((r) => ({
      name: String(r.name ?? "").trim(),
      employeeNo: String(r.employeeNo ?? "").trim(),
      position: String(r.position ?? "").trim(),
      contact: String(r.contact ?? "").trim(),
      email: String(r.email ?? "").trim(),
      status: String(r.status ?? "").trim(),
    }))
    .filter((s) => s.name !== "");

  return staff.length > 0 ? staff : sampleStaff;
}
