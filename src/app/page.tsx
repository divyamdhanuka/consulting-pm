'use client';

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  FolderOpen,
  GripVertical,
  Plus,
  Search,
  Trash2,
} from "lucide-react";

// =========================
// Types
// =========================

type Status = "In Progress" | "Completed" | "Delayed";

type MeetingHealth = "On track" | "At risk";

type Route =
  | { page: "projects" }
  | { page: "project"; projectId: string };

type CalendarMode = "month" | "week";

type DragPayload =
  | { kind: "meeting"; id: string }
  | { kind: "clientReview"; id: string }
  | { kind: "partnerReview"; id: string }
  | { kind: "detailed"; id: string };

interface MajorMeeting {
  id: string;
  title: string;
  client: string;
  meetingDate: string | null; // ISO YYYY-MM-DD
  status: Status;
  agenda: string;
}

interface WorkRequired {
  id: string;
  meetingId: string;
  workRequired: string;
  workstream: string; // editable only here
  owner: string;
  clientReviewDate: string | null; // ISO
  partnerReviewDate: string | null; // ISO
}

interface DetailedWork {
  id: string;
  workRequiredId: string;
  detailedAnalyses: string;
  clientOwner: string;
  clientDiscussionsRequired: boolean;
  date: string | null; // ISO
  owner: string;
  status: Status;
}

interface ProjectData {
  id: string;
  name: string;
  createdAt: number;
  meetings: MajorMeeting[];
  workRequired: WorkRequired[];
  detailedWork: DetailedWork[];
}

// =========================
// Styling helpers
// =========================

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

const STATUS_META: Record<Status, { pill: string; dot: string }> = {
  "Delayed": {
    pill: "border-red-200 bg-red-100 text-red-800",
    dot: "bg-red-500",
  },
  "In Progress": {
    pill: "border-yellow-200 bg-yellow-100 text-yellow-900",
    dot: "bg-yellow-500",
  },
  "Completed": {
    pill: "border-green-200 bg-green-100 text-green-800",
    dot: "bg-green-500",
  },
};

const HEALTH_META: Record<MeetingHealth, { pill: string; dot: string }> = {
  "At risk": {
    pill: "border-red-200 bg-red-50 text-red-700",
    dot: "bg-red-500",
  },
  "On track": {
    pill: "border-green-200 bg-green-50 text-green-700",
    dot: "bg-green-500",
  },
};

const DISCUSSION = {
  client: "border-purple-200 bg-purple-100 text-purple-800",
  partner: "border-blue-200 bg-blue-100 text-blue-800",
  detailed: "border-gray-200 bg-gray-100 text-gray-800",
};

function Pill({
  label,
  className,
  dotClass,
}: {
  label: string;
  className: string;
  dotClass?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        className
      )}
    >
      {dotClass ? <span className={cn("h-1.5 w-1.5 rounded-full", dotClass)} /> : null}
      {label}
    </span>
  );
}

function StatusPill({ status }: { status: Status }) {
  return (
    <Pill
      label={status}
      className={STATUS_META[status].pill}
      dotClass={STATUS_META[status].dot}
    />
  );
}

function HealthPill({ health }: { health: MeetingHealth }) {
  return (
    <Pill
      label={health}
      className={HEALTH_META[health].pill}
      dotClass={HEALTH_META[health].dot}
    />
  );
}

function DotCount({
  label,
  count,
  className,
}: {
  label: string;
  count: number;
  className: string;
}) {
  if (!count) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-2 py-0.5 text-xs",
        className
      )}
      title={`${label}: ${count}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      <span className="tabular-nums">{count}</span>
      <span className="hidden sm:inline">{label}</span>
    </span>
  );
}

// =========================
// Date utils (DD-MM-YYYY UI; ISO internal)
// =========================

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function todayIsoLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function isoToDDMMYYYY(iso: string | null | undefined) {
  if (!iso) return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  const y = m[1];
  const mo = m[2];
  const da = m[3];
  return `${da}-${mo}-${y}`;
}

function ddmmyyyyToIso(text: string): string | null | undefined {
  const t = text.trim();
  if (!t) return null;
  const m = t.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!m) return undefined;
  const dd = Number(m[1]);
  const mm = Number(m[2]);
  const yyyy = Number(m[3]);
  if (!Number.isFinite(dd) || !Number.isFinite(mm) || !Number.isFinite(yyyy)) return undefined;
  if (yyyy < 1900 || yyyy > 2100) return undefined;
  if (mm < 1 || mm > 12) return undefined;
  const max = new Date(yyyy, mm, 0).getDate();
  if (dd < 1 || dd > max) return undefined;
  return `${yyyy}-${pad2(mm)}-${pad2(dd)}`;
}

function compareIso(a: string | null, b: string | null) {
  if (a && b) return a.localeCompare(b);
  if (a && !b) return -1;
  if (!a && b) return 1;
  return 0;
}

function minIso(a: string | null, b: string | null): string | null {
  if (a && b) return a < b ? a : b;
  return a ?? b;
}

function addDaysIso(baseIso: string, days: number) {
  const [y, m, d] = baseIso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

function startOfWeekIso(iso: string) {
  // Monday as start
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const dow = (dt.getDay() + 6) % 7; // Mon=0
  dt.setDate(dt.getDate() - dow);
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

function addWeeksIso(iso: string, weeks: number) {
  return addDaysIso(iso, weeks * 7);
}

function monthStartIso(iso: string) {
  const [y, m] = iso.split("-").map(Number);
  return `${y}-${pad2(m)}-01`;
}

function monthLabel(iso: string) {
  const [y, m] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, 1);
  return dt.toLocaleString(undefined, { month: "long", year: "numeric" });
}

function isoDayLabel(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// =========================
// Inputs (must be white bg + black text)
// =========================

function SmallInput(props: React.ComponentProps<typeof Input>) {
  return (
    <Input
      {...props}
      className={cn(
        "h-8 bg-white text-black placeholder:text-gray-400",
        props.className
      )}
    />
  );
}

function SmallTextarea(props: React.ComponentProps<typeof Textarea>) {
  return (
    <Textarea
      {...props}
      className={cn(
        "min-h-[60px] bg-white text-black placeholder:text-gray-400",
        props.className
      )}
    />
  );
}

function DateInput({
  value,
  onChange,
  className,
  placeholder = "DD-MM-YYYY",
}: {
  value: string | null;
  onChange: (iso: string | null) => void;
  className?: string;
  placeholder?: string;
}) {
  const [text, setText] = useState(isoToDDMMYYYY(value));
  const [invalid, setInvalid] = useState(false);
  const isFocused = useRef(false);

  useEffect(() => {
    if (!isFocused.current) {
      setText(isoToDDMMYYYY(value));
      setInvalid(false);
    }
  }, [value]);

  const commit = () => {
    const parsed = ddmmyyyyToIso(text);
    if (parsed === undefined) {
      setInvalid(Boolean(text.trim()));
      return;
    }
    setInvalid(false);
    onChange(parsed); // parsed can be null
  };

  return (
    <SmallInput
      value={text}
      placeholder={placeholder}
      onFocus={() => {
        isFocused.current = true;
      }}
      onBlur={() => {
        isFocused.current = false;
        commit();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          (e.target as HTMLInputElement).blur();
        }
      }}
      onChange={(e) => {
        setText(e.target.value);
        if (invalid) setInvalid(false);
      }}
      className={cn(
        "w-[130px]",
        invalid ? "border-red-400 focus-visible:ring-red-300" : "",
        className
      )}
      inputMode="numeric"
    />
  );
}

function StatusSelect({
  value,
  onChange,
  className,
}: {
  value: Status;
  onChange: (s: Status) => void;
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as Status)}>
      <SelectTrigger
        className={cn(
          "h-8 w-[150px] bg-white text-black",
          className
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="In Progress">In Progress</SelectItem>
        <SelectItem value="Completed">Completed</SelectItem>
        <SelectItem value="Delayed">Delayed</SelectItem>
      </SelectContent>
    </Select>
  );
}

function FilterSelect({
  value,
  onChange,
  placeholder,
  options,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: string[];
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={cn("h-8 w-[220px] bg-white text-black", className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__all__">All</SelectItem>
        {options.map((o) => (
          <SelectItem key={o} value={o}>
            {o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// =========================
// Storage + Seed
// =========================

const STORAGE_KEY = "consulting_pm_projects_v1";

function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}_${Date.now().toString(36)}`;
}

function createSeedProject(name = "Default Project"): ProjectData {
  const today = todayIsoLocal();

  const m1: MajorMeeting = {
    id: uid("m"),
    title: "Kick-off: Current state & plan",
    client: "Acme Co",
    meetingDate: addDaysIso(today, 3),
    status: "In Progress",
    agenda: "Confirm scope, align on workstreams, agree milestones and weekly cadence.",
  };

  const m2: MajorMeeting = {
    id: uid("m"),
    title: "Design review: Target operating model",
    client: "Acme Co",
    meetingDate: addDaysIso(today, 12),
    status: "In Progress",
    agenda: "Walk through draft TOM, confirm decision points and open questions.",
  };

  const wr1: WorkRequired = {
    id: uid("wr"),
    meetingId: m1.id,
    workRequired: "Baseline performance and cost drivers",
    workstream: "Diagnostics",
    owner: "You",
    clientReviewDate: addDaysIso(today, 5),
    partnerReviewDate: addDaysIso(today, 6),
  };

  const wr2: WorkRequired = {
    id: uid("wr"),
    meetingId: m1.id,
    workRequired: "Stakeholder map and interview guide",
    workstream: "Change",
    owner: "Alex",
    clientReviewDate: addDaysIso(today, 4),
    partnerReviewDate: null,
  };

  const wr3: WorkRequired = {
    id: uid("wr"),
    meetingId: m2.id,
    workRequired: "Draft TOM options and trade-offs",
    workstream: "Design",
    owner: "Sam",
    clientReviewDate: addDaysIso(today, 11),
    partnerReviewDate: addDaysIso(today, 10),
  };

  const wr4: WorkRequired = {
    id: uid("wr"),
    meetingId: m2.id,
    workRequired: "Roadmap (12 weeks) incl. governance",
    workstream: "PMO",
    owner: "You",
    clientReviewDate: addDaysIso(today, 13),
    partnerReviewDate: addDaysIso(today, 9),
  };

  const dw1: DetailedWork = {
    id: uid("dw"),
    workRequiredId: wr1.id,
    detailedAnalyses: "Cost driver tree + quick sizing",
    clientOwner: "Pat (Client)",
    clientDiscussionsRequired: true,
    date: addDaysIso(today, 2),
    owner: "You",
    status: "In Progress",
  };

  const dw2: DetailedWork = {
    id: uid("dw"),
    workRequiredId: wr1.id,
    detailedAnalyses: "Data request and validation",
    clientOwner: "Taylor (Client)",
    clientDiscussionsRequired: false,
    date: addDaysIso(today, -1),
    owner: "Alex",
    status: "In Progress",
  };

  const dw3: DetailedWork = {
    id: uid("dw"),
    workRequiredId: wr2.id,
    detailedAnalyses: "Interview plan + schedule",
    clientOwner: "Jordan (Client)",
    clientDiscussionsRequired: true,
    date: addDaysIso(today, 3),
    owner: "Sam",
    status: "Delayed",
  };

  const dw4: DetailedWork = {
    id: uid("dw"),
    workRequiredId: wr3.id,
    detailedAnalyses: "TOM option A (lean) outline",
    clientOwner: "Pat (Client)",
    clientDiscussionsRequired: false,
    date: addDaysIso(today, 8),
    owner: "Sam",
    status: "In Progress",
  };

  const dw5: DetailedWork = {
    id: uid("dw"),
    workRequiredId: wr3.id,
    detailedAnalyses: "TOM option B (resilience) outline",
    clientOwner: "Pat (Client)",
    clientDiscussionsRequired: false,
    date: addDaysIso(today, 9),
    owner: "You",
    status: "Completed",
  };

  const dw6: DetailedWork = {
    id: uid("dw"),
    workRequiredId: wr4.id,
    detailedAnalyses: "Governance model + RACI draft",
    clientOwner: "Taylor (Client)",
    clientDiscussionsRequired: true,
    date: addDaysIso(today, 7),
    owner: "Alex",
    status: "In Progress",
  };

  return {
    id: uid("p"),
    name,
    createdAt: Date.now(),
    meetings: [m1, m2],
    workRequired: [wr1, wr2, wr3, wr4],
    detailedWork: [dw1, dw2, dw3, dw4, dw5, dw6],
  };
}

function safeLoadProjects(): ProjectData[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed as ProjectData[];
  } catch {
    return null;
  }
}

function safeSaveProjects(projects: ProjectData[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  } catch {
    // ignore
  }
}

// =========================
// Core data helpers
// =========================

function uniqSorted(values: string[]) {
  return Array.from(new Set(values.filter((v) => v.trim()))).sort((a, b) => a.localeCompare(b));
}

function includesCI(hay: string, needle: string) {
  return hay.toLowerCase().includes(needle.toLowerCase());
}

function earliestReviewDate(wr: WorkRequired) {
  return minIso(wr.clientReviewDate, wr.partnerReviewDate);
}

// =========================
// App
// =========================

export default function App() {
  const [route, setRoute] = useState<Route>({ page: "projects" });

  const [projects, setProjects] = useState<ProjectData[]>(() => {
    const loaded = safeLoadProjects();
    return loaded && loaded.length ? loaded : [createSeedProject()];
  });

  // Persist
  useEffect(() => {
    safeSaveProjects(projects);
  }, [projects]);

  // If all deleted, auto-create a default
  useEffect(() => {
    if (projects.length === 0) {
      setProjects([createSeedProject("Default Project")]);
    }
  }, [projects.length]);

  // If current project is deleted, return to Projects
  useEffect(() => {
    if (route.page === "project") {
      const exists = projects.some((p) => p.id === route.projectId);
      if (!exists) setRoute({ page: "projects" });
    }
  }, [projects, route]);

  const openProject = (projectId: string) => setRoute({ page: "project", projectId });

  const updateProject = (projectId: string, updater: (p: ProjectData) => ProjectData) => {
    setProjects((prev) => prev.map((p) => (p.id === projectId ? updater(p) : p)));
  };

  const deleteProject = (projectId: string) => {
    setProjects((prev) => prev.filter((p) => p.id !== projectId));
  };

  const createProject = (name: string) => {
    const p = createSeedProject(name.trim() || `Project ${projects.length + 1}`);
    // Make it a clean project (seed structure but keep examples? requirement says demo seed data; keep seed is fine)
    // If you want a blank project instead, you can swap to a blank generator.
    setProjects((prev) => [p, ...prev]);
    setRoute({ page: "project", projectId: p.id });
  };

  return (
    <div className="min-h-screen bg-gray-100 text-gray-900">
      <div className="mx-auto max-w-[1400px] px-4 py-6">
        {route.page === "projects" ? (
          <ProjectsPage
            projects={projects}
            onOpen={openProject}
            onDelete={deleteProject}
            onCreate={createProject}
          />
        ) : (
          <ProjectPage
            project={projects.find((p) => p.id === route.projectId)!}
            onBack={() => setRoute({ page: "projects" })}
            updateProject={(updater) => updateProject(route.projectId, updater)}
          />
        )}
      </div>
    </div>
  );
}

// =========================
// Projects Page
// =========================

function ProjectsPage({
  projects,
  onOpen,
  onDelete,
  onCreate,
}: {
  projects: ProjectData[];
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onCreate: (name: string) => void;
}) {
  const [name, setName] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-2xl font-semibold">Projects</div>
          <div className="text-sm text-gray-600">
            Create, open, and manage consulting project workplans (saved locally on this device).
          </div>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <SmallInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New project name"
            className="w-full sm:w-[260px]"
          />
          <Button
            className="gap-2"
            onClick={() => {
              onCreate(name);
              setName("");
            }}
          >
            <Plus className="h-4 w-4" />
            Create project
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {projects
          .slice()
          .sort((a, b) => b.createdAt - a.createdAt)
          .map((p) => {
            const meetings = p.meetings.length;
            const wr = p.workRequired.length;
            const dw = p.detailedWork.length;
            return (
              <Card key={p.id} className="border-gray-200 bg-white shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-base font-semibold">{p.name}</div>
                      <div className="mt-1 text-xs text-gray-600">
                        {meetings} meetings • {wr} work required • {dw} detailed work
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        className="h-8 gap-2"
                        onClick={() => onOpen(p.id)}
                      >
                        <FolderOpen className="h-4 w-4" />
                        Open
                      </Button>
                      <Button
                        variant="ghost"
                        className="h-8 w-8 p-0 text-gray-600 hover:text-red-700"
                        onClick={() => setDeleteId(p.id)}
                        title="Delete project"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardTitle>
                </CardHeader>
              </Card>
            );
          })}
      </div>

      <Dialog open={Boolean(deleteId)} onOpenChange={(o) => !o && setDeleteId(null)}>
        <DialogContent className="bg-white">
          <DialogHeader>
            <DialogTitle>Delete project?</DialogTitle>
            <DialogDescription>
              This permanently removes the project from this device (localStorage).
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>
              Cancel
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (deleteId) onDelete(deleteId);
                setDeleteId(null);
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// =========================
// Project Page
// =========================

function ProjectPage({
  project,
  onBack,
  updateProject,
}: {
  project: ProjectData;
  onBack: () => void;
  updateProject: (updater: (p: ProjectData) => ProjectData) => void;
}) {
  const [tab, setTab] = useState<string>("meetings");
  const [search, setSearch] = useState<string>("");
  const [workstreamFilter, setWorkstreamFilter] = useState<string>("__all__");
  const [ownerFilter, setOwnerFilter] = useState<string>("__all__");

  const today = todayIsoLocal();

  const maps = useMemo(() => {
    const meetingById = new Map(project.meetings.map((m) => [m.id, m] as const));
    const wrById = new Map(project.workRequired.map((w) => [w.id, w] as const));
    const dwById = new Map(project.detailedWork.map((d) => [d.id, d] as const));

    const wrByMeeting = new Map<string, WorkRequired[]>();
    for (const wr of project.workRequired) {
      const arr = wrByMeeting.get(wr.meetingId) ?? [];
      arr.push(wr);
      wrByMeeting.set(wr.meetingId, arr);
    }

    const dwByWr = new Map<string, DetailedWork[]>();
    for (const dw of project.detailedWork) {
      const arr = dwByWr.get(dw.workRequiredId) ?? [];
      arr.push(dw);
      dwByWr.set(dw.workRequiredId, arr);
    }

    return { meetingById, wrById, dwById, wrByMeeting, dwByWr };
  }, [project]);

  const workstreams = useMemo(
    () =>
      uniqSorted(
        project.workRequired.map((w) => w.workstream).filter((x) => x && x.trim())
      ),
    [project.workRequired]
  );

  const owners = useMemo(() => {
    const raw = [
      ...project.workRequired.map((w) => w.owner),
      ...project.detailedWork.map((d) => d.owner),
    ];
    return uniqSorted(raw.filter((x) => x && x.trim()));
  }, [project.workRequired, project.detailedWork]);

  const deriveWorkstreamForDw = (dw: DetailedWork) => {
    const wr = maps.wrById.get(dw.workRequiredId);
    return wr?.workstream ?? "";
  };

  const meetingHealth = (meetingId: string): MeetingHealth => {
    const wrs = maps.wrByMeeting.get(meetingId) ?? [];
    for (const wr of wrs) {
      const dws = maps.dwByWr.get(wr.id) ?? [];
      for (const dw of dws) {
        if (dw.status === "Delayed") return "At risk";
      }
    }
    for (const wr of wrs) {
      const dws = maps.dwByWr.get(wr.id) ?? [];
      for (const dw of dws) {
        if (dw.date && dw.status !== "Completed" && dw.date < today) return "At risk";
      }
    }
    return "On track";
  };

  const applySearch = (text: string) => {
    const q = search.trim();
    if (!q) return true;
    return includesCI(text, q);
  };

  const workstreamOk = (ws: string) => {
    if (workstreamFilter === "__all__") return true;
    return ws === workstreamFilter;
  };

  const ownerOk = (owner: string) => {
    if (ownerFilter === "__all__") return true;
    return owner === ownerFilter;
  };

  const meetingMatches = (m: MajorMeeting) => {
    const q = search.trim();
    const meetingTextHit =
      !q ||
      applySearch(m.title) ||
      applySearch(m.client) ||
      applySearch(m.agenda);

    const wrs = maps.wrByMeeting.get(m.id) ?? [];

    const childHit = wrs.some((wr) => {
      const wrTextHit =
        !q ||
        applySearch(wr.workRequired) ||
        applySearch(wr.workstream) ||
        applySearch(wr.owner);

      const dwHit = (maps.dwByWr.get(wr.id) ?? []).some((dw) => {
        const dwWs = deriveWorkstreamForDw(dw);
        const wsOk = workstreamOk(dwWs);
        const ownOk = ownerOk(dw.owner);
        const txtOk =
          !q ||
          applySearch(dw.detailedAnalyses) ||
          applySearch(dw.clientOwner) ||
          applySearch(dw.owner);
        return wsOk && ownOk && txtOk;
      });

      const wsOk = workstreamOk(wr.workstream);
      const ownOk = ownerOk(wr.owner);
      return (wsOk && ownOk && wrTextHit) || dwHit;
    });

    // If filters are active, meeting must have matching children
    const filtersActive = workstreamFilter !== "__all__" || ownerFilter !== "__all__";
    if (filtersActive) return childHit;

    // Otherwise, meeting itself OR children may match search
    return meetingTextHit || childHit;
  };

  // ---------- Mutations ----------

  const addMeeting = () => {
    updateProject((p) => {
      const nm: MajorMeeting = {
        id: uid("m"),
        title: "New meeting",
        client: "",
        meetingDate: null,
        status: "In Progress",
        agenda: "",
      };
      return { ...p, meetings: [nm, ...p.meetings] };
    });
  };

  const deleteMeeting = (meetingId: string) => {
    updateProject((p) => {
      const wrIds = p.workRequired.filter((w) => w.meetingId === meetingId).map((w) => w.id);
      return {
        ...p,
        meetings: p.meetings.filter((m) => m.id !== meetingId),
        workRequired: p.workRequired.filter((w) => w.meetingId !== meetingId),
        detailedWork: p.detailedWork.filter((d) => !wrIds.includes(d.workRequiredId)),
      };
    });
  };

  const addWorkRequired = (meetingId: string) => {
    updateProject((p) => {
      const nw: WorkRequired = {
        id: uid("wr"),
        meetingId,
        workRequired: "New work required",
        workstream: "",
        owner: "",
        clientReviewDate: null,
        partnerReviewDate: null,
      };
      return { ...p, workRequired: [nw, ...p.workRequired] };
    });
  };

  const deleteWorkRequired = (wrId: string) => {
    updateProject((p) => ({
      ...p,
      workRequired: p.workRequired.filter((w) => w.id !== wrId),
      detailedWork: p.detailedWork.filter((d) => d.workRequiredId !== wrId),
    }));
  };

  const addDetailedWork = (wrId: string) => {
    updateProject((p) => {
      const nd: DetailedWork = {
        id: uid("dw"),
        workRequiredId: wrId,
        detailedAnalyses: "New detailed work",
        clientOwner: "",
        clientDiscussionsRequired: false,
        date: null,
        owner: "",
        status: "In Progress",
      };
      return { ...p, detailedWork: [nd, ...p.detailedWork] };
    });
  };

  const deleteDetailedWork = (dwId: string) => {
    updateProject((p) => ({
      ...p,
      detailedWork: p.detailedWork.filter((d) => d.id !== dwId),
    }));
  };

  const updateMeeting = (meetingId: string, patch: Partial<MajorMeeting>) => {
    updateProject((p) => ({
      ...p,
      meetings: p.meetings.map((m) => (m.id === meetingId ? { ...m, ...patch } : m)),
    }));
  };

  const updateWR = (wrId: string, patch: Partial<WorkRequired>) => {
    updateProject((p) => ({
      ...p,
      workRequired: p.workRequired.map((w) => (w.id === wrId ? { ...w, ...patch } : w)),
    }));
  };

  const updateDW = (dwId: string, patch: Partial<DetailedWork>) => {
    updateProject((p) => ({
      ...p,
      detailedWork: p.detailedWork.map((d) => (d.id === dwId ? { ...d, ...patch } : d)),
    }));
  };

  const moveWRToMeeting = (wrId: string, meetingId: string) => {
    updateWR(wrId, { meetingId });
  };

  const moveDWToWR = (dwId: string, wrId: string) => {
    updateDW(dwId, { workRequiredId: wrId });
  };

  // Drag-drop date reschedule
  const reschedule = (payload: DragPayload, targetIso: string) => {
    if (payload.kind === "meeting") {
      updateMeeting(payload.id, { meetingDate: targetIso });
    }
    if (payload.kind === "clientReview") {
      updateWR(payload.id, { clientReviewDate: targetIso });
    }
    if (payload.kind === "partnerReview") {
      updateWR(payload.id, { partnerReviewDate: targetIso });
    }
    if (payload.kind === "detailed") {
      updateDW(payload.id, { date: targetIso });
    }
  };

  // ---------- Move dialogs (shared) ----------

  const [moveWrId, setMoveWrId] = useState<string | null>(null);
  const [moveDwId, setMoveDwId] = useState<string | null>(null);
  const [deleteMeetingId, setDeleteMeetingId] = useState<string | null>(null);
  const [deleteWrId, setDeleteWrId] = useState<string | null>(null);
  const [deleteDwId, setDeleteDwId] = useState<string | null>(null);

  const meetingsSorted = useMemo(() => {
    return project.meetings
      .slice()
      .sort((a, b) => compareIso(a.meetingDate, b.meetingDate));
  }, [project.meetings]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" className="h-8 gap-2" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
            Back to Projects
          </Button>
          <div className="hidden h-6 w-px bg-gray-300 md:block" />
          <div className="text-xl font-semibold">{project.name}</div>
        </div>

        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
            <SmallInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Global search"
              className="w-full pl-8 md:w-[300px]"
            />
          </div>

          <FilterSelect
            value={workstreamFilter}
            onChange={setWorkstreamFilter}
            placeholder="Workstream"
            options={workstreams}
            className="w-full md:w-[220px]"
          />

          <FilterSelect
            value={ownerFilter}
            onChange={setOwnerFilter}
            placeholder="Owner"
            options={owners}
            className="w-full md:w-[220px]"
          />
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full justify-start overflow-x-auto bg-white">
          <TabsTrigger value="meetings">Major meetings</TabsTrigger>
          <TabsTrigger value="detailed">Detailed work</TabsTrigger>
          <TabsTrigger value="partners">Review with partners</TabsTrigger>
          <TabsTrigger value="owners">Owners / tasks</TabsTrigger>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
        </TabsList>

        <TabsContent value="meetings" className="mt-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">
              Meetings are sorted by meeting date. Health is automatic and updates everywhere.
            </div>
            <Button className="h-8 gap-2" onClick={addMeeting}>
              <Plus className="h-4 w-4" />
              Add meeting
            </Button>
          </div>

          <MajorMeetingsTab
            meetings={meetingsSorted.filter(meetingMatches)}
            project={project}
            maps={maps}
            meetingHealth={meetingHealth}
            deriveWorkstreamForDw={deriveWorkstreamForDw}
            addWorkRequired={addWorkRequired}
            addDetailedWork={addDetailedWork}
            updateMeeting={updateMeeting}
            updateWR={updateWR}
            updateDW={updateDW}
            onMoveWR={(wrId) => setMoveWrId(wrId)}
            onMoveDW={(dwId) => setMoveDwId(dwId)}
            onDeleteMeeting={(meetingId) => setDeleteMeetingId(meetingId)}
            onDeleteWR={(wrId) => setDeleteWrId(wrId)}
            onDeleteDW={(dwId) => setDeleteDwId(dwId)}
            search={search}
            workstreamFilter={workstreamFilter}
            ownerFilter={ownerFilter}
          />
        </TabsContent>

        <TabsContent value="detailed" className="mt-4">
          <DetailedWorkTab
            project={project}
            maps={maps}
            deriveWorkstreamForDw={deriveWorkstreamForDw}
            meetingHealth={meetingHealth}
            updateDW={updateDW}
            onMoveDW={(dwId) => setMoveDwId(dwId)}
            onDeleteDW={(dwId) => setDeleteDwId(dwId)}
            search={search}
            workstreamFilter={workstreamFilter}
            ownerFilter={ownerFilter}
          />
        </TabsContent>

        <TabsContent value="partners" className="mt-4">
          <PartnersReviewTab
            project={project}
            maps={maps}
            meetingHealth={meetingHealth}
            updateWR={updateWR}
            onMoveWR={(wrId) => setMoveWrId(wrId)}
            onDeleteWR={(wrId) => setDeleteWrId(wrId)}
            search={search}
            workstreamFilter={workstreamFilter}
            ownerFilter={ownerFilter}
          />
        </TabsContent>

        <TabsContent value="owners" className="mt-4">
          <OwnersTasksTab
            project={project}
            maps={maps}
            deriveWorkstreamForDw={deriveWorkstreamForDw}
            meetingHealth={meetingHealth}
            updateDW={updateDW}
            onMoveDW={(dwId) => setMoveDwId(dwId)}
            onDeleteDW={(dwId) => setDeleteDwId(dwId)}
            search={search}
            workstreamFilter={workstreamFilter}
            ownerFilter={ownerFilter}
          />
        </TabsContent>

        <TabsContent value="calendar" className="mt-4">
          <CalendarTab
            project={project}
            maps={maps}
            deriveWorkstreamForDw={deriveWorkstreamForDw}
            meetingHealth={meetingHealth}
            search={search}
            workstreamFilter={workstreamFilter}
            ownerFilter={ownerFilter}
            reschedule={reschedule}
          />
        </TabsContent>
      </Tabs>

      {/* Move Work Required to another meeting */}
      <MoveWorkRequiredDialog
        open={Boolean(moveWrId)}
        onOpenChange={(o) => !o && setMoveWrId(null)}
        project={project}
        wrId={moveWrId}
        maps={maps}
        onMove={(wrId, meetingId) => moveWRToMeeting(wrId, meetingId)}
      />

      {/* Move Detailed Work to another Work Required */}
      <MoveDetailedWorkDialog
        open={Boolean(moveDwId)}
        onOpenChange={(o) => !o && setMoveDwId(null)}
        project={project}
        dwId={moveDwId}
        maps={maps}
        onMove={(dwId, wrId) => moveDWToWR(dwId, wrId)}
      />

      {/* Delete confirmations */}
      <ConfirmDialog
        open={Boolean(deleteMeetingId)}
        title="Delete meeting?"
        description="This deletes the meeting, all Work Required, and all linked Detailed Work."
        confirmLabel="Delete"
        destructive
        onCancel={() => setDeleteMeetingId(null)}
        onConfirm={() => {
          if (deleteMeetingId) deleteMeeting(deleteMeetingId);
          setDeleteMeetingId(null);
        }}
      />

      <ConfirmDialog
        open={Boolean(deleteWrId)}
        title="Delete work required?"
        description="This deletes the Work Required row and all linked Detailed Work."
        confirmLabel="Delete"
        destructive
        onCancel={() => setDeleteWrId(null)}
        onConfirm={() => {
          if (deleteWrId) deleteWorkRequired(deleteWrId);
          setDeleteWrId(null);
        }}
      />

      <ConfirmDialog
        open={Boolean(deleteDwId)}
        title="Delete detailed work?"
        description="This deletes the Detailed Work item."
        confirmLabel="Delete"
        destructive
        onCancel={() => setDeleteDwId(null)}
        onConfirm={() => {
          if (deleteDwId) deleteDetailedWork(deleteDwId);
          setDeleteDwId(null);
        }}
      />
    </div>
  );
}

function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  destructive,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="bg-white">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            className={cn(destructive ? "bg-red-600 hover:bg-red-700" : "")}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =========================
// Major Meetings Tab
// =========================

function MajorMeetingsTab({
  meetings,
  project,
  maps,
  meetingHealth,
  deriveWorkstreamForDw,
  addWorkRequired,
  addDetailedWork,
  updateMeeting,
  updateWR,
  updateDW,
  onMoveWR,
  onMoveDW,
  onDeleteMeeting,
  onDeleteWR,
  onDeleteDW,
  search,
  workstreamFilter,
  ownerFilter,
}: {
  meetings: MajorMeeting[];
  project: ProjectData;
  maps: {
    meetingById: Map<string, MajorMeeting>;
    wrById: Map<string, WorkRequired>;
    dwById: Map<string, DetailedWork>;
    wrByMeeting: Map<string, WorkRequired[]>;
    dwByWr: Map<string, DetailedWork[]>;
  };
  meetingHealth: (meetingId: string) => MeetingHealth;
  deriveWorkstreamForDw: (dw: DetailedWork) => string;
  addWorkRequired: (meetingId: string) => void;
  addDetailedWork: (wrId: string) => void;
  updateMeeting: (meetingId: string, patch: Partial<MajorMeeting>) => void;
  updateWR: (wrId: string, patch: Partial<WorkRequired>) => void;
  updateDW: (dwId: string, patch: Partial<DetailedWork>) => void;
  onMoveWR: (wrId: string) => void;
  onMoveDW: (dwId: string) => void;
  onDeleteMeeting: (meetingId: string) => void;
  onDeleteWR: (wrId: string) => void;
  onDeleteDW: (dwId: string) => void;
  search: string;
  workstreamFilter: string;
  ownerFilter: string;
}) {
  const [expandedMeetings, setExpandedMeetings] = useState<Record<string, boolean>>({});
  const [expandedWR, setExpandedWR] = useState<Record<string, boolean>>({});

  const q = search.trim().toLowerCase();
  const filtersActive = workstreamFilter !== "__all__" || ownerFilter !== "__all__" || Boolean(q);

  const wrMatches = (wr: WorkRequired) => {
    const wsOk = workstreamFilter === "__all__" || wr.workstream === workstreamFilter;
    const ownOk = ownerFilter === "__all__" || wr.owner === ownerFilter;
    const txtOk =
      !q ||
      [wr.workRequired, wr.workstream, wr.owner].some((t) => t.toLowerCase().includes(q));
    return wsOk && ownOk && txtOk;
  };

  const dwMatches = (dw: DetailedWork) => {
    const ws = deriveWorkstreamForDw(dw);
    const wsOk = workstreamFilter === "__all__" || ws === workstreamFilter;
    const ownOk = ownerFilter === "__all__" || dw.owner === ownerFilter;
    const txtOk =
      !q ||
      [dw.detailedAnalyses, dw.clientOwner, dw.owner].some((t) => t.toLowerCase().includes(q));
    return wsOk && ownOk && txtOk;
  };

  return (
    <div className="space-y-3">
      {meetings.length === 0 ? (
        <Card className="border-gray-200 bg-white shadow-sm">
          <CardContent className="py-10 text-center text-sm text-gray-600">
            No meetings match the current filters.
          </CardContent>
        </Card>
      ) : null}

      {meetings.map((m) => {
        const isOpen = expandedMeetings[m.id] ?? true;
        const health = meetingHealth(m.id);

        const wrsAll = (maps.wrByMeeting.get(m.id) ?? [])
          .slice()
          .sort((a, b) => compareIso(earliestReviewDate(a), earliestReviewDate(b)));

        const showWrs = filtersActive
          ? wrsAll.filter((wr) => {
              if (wrMatches(wr)) return true;
              const dws = maps.dwByWr.get(wr.id) ?? [];
              return dws.some(dwMatches);
            })
          : wrsAll;

        return (
          <Card key={m.id} className="border-gray-200 bg-white shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div className="flex items-start gap-3">
                  <Button
                    variant="ghost"
                    className="h-8 w-8 p-0 text-gray-600"
                    onClick={() =>
                      setExpandedMeetings((prev) => ({ ...prev, [m.id]: !(prev[m.id] ?? true) }))
                    }
                    title={isOpen ? "Collapse" : "Expand"}
                  >
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 transition-transform",
                        isOpen ? "rotate-0" : "-rotate-90"
                      )}
                    />
                  </Button>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="truncate text-base font-semibold">{m.title}</div>
                      <StatusPill status={m.status} />
                      <HealthPill health={health} />
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-600">
                      <span className="rounded-md bg-gray-50 px-2 py-0.5">Client: {m.client || "—"}</span>
                      <span className="rounded-md bg-gray-50 px-2 py-0.5">
                        Date: {m.meetingDate ? isoToDDMMYYYY(m.meetingDate) : "—"}
                      </span>
                      <span className="rounded-md bg-gray-50 px-2 py-0.5">
                        Work Required: {wrsAll.length}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    className="h-8 gap-2"
                    onClick={() => addWorkRequired(m.id)}
                    title="Add Work Required (inside this meeting)"
                  >
                    <Plus className="h-4 w-4" />
                    Add work required
                  </Button>
                  <Button
                    variant="ghost"
                    className="h-8 w-8 p-0 text-gray-600 hover:text-red-700"
                    onClick={() => onDeleteMeeting(m.id)}
                    title="Delete meeting"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>

            {isOpen ? (
              <CardContent className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <div className="mb-1 text-xs text-gray-600">Title</div>
                    <SmallInput
                      value={m.title}
                      onChange={(e) => updateMeeting(m.id, { title: e.target.value })}
                    />
                  </div>
                  <div>
                    <div className="mb-1 text-xs text-gray-600">Client</div>
                    <SmallInput
                      value={m.client}
                      onChange={(e) => updateMeeting(m.id, { client: e.target.value })}
                    />
                  </div>
                  <div>
                    <div className="mb-1 text-xs text-gray-600">Meeting date</div>
                    <DateInput
                      value={m.meetingDate}
                      onChange={(iso) => updateMeeting(m.id, { meetingDate: iso })}
                    />
                  </div>
                  <div>
                    <div className="mb-1 text-xs text-gray-600">Status</div>
                    <StatusSelect
                      value={m.status}
                      onChange={(s) => updateMeeting(m.id, { status: s })}
                    />
                  </div>
                </div>

                <div>
                  <div className="mb-1 text-xs text-gray-600">Agenda</div>
                  <SmallTextarea
                    rows={2}
                    value={m.agenda}
                    onChange={(e) => updateMeeting(m.id, { agenda: e.target.value })}
                  />
                </div>

                <Separator />

                <div className="text-sm font-semibold">Work Required</div>

                <div className="overflow-x-auto rounded-lg border border-gray-200">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs text-gray-600">
                      <tr>
                        <th className="w-[36px] px-2 py-2 text-left"></th>
                        <th className="px-2 py-2 text-left">Work required</th>
                        <th className="px-2 py-2 text-left">Workstream</th>
                        <th className="px-2 py-2 text-left">Owner</th>
                        <th className="px-2 py-2 text-left">Client review</th>
                        <th className="px-2 py-2 text-left">Partner review</th>
                        <th className="w-[200px] px-2 py-2 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {showWrs.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-3 py-6 text-center text-sm text-gray-600">
                            No Work Required rows match the current filters.
                          </td>
                        </tr>
                      ) : null}

                      {showWrs.map((wr) => {
                        const open = expandedWR[wr.id] ?? false;
                        const dwsAll = (maps.dwByWr.get(wr.id) ?? [])
                          .slice()
                          .sort((a, b) => compareIso(a.date, b.date));
                        const dws = filtersActive ? dwsAll.filter(dwMatches) : dwsAll;

                        return (
                          <React.Fragment key={wr.id}>
                            <tr className="border-t border-gray-200 align-top">
                              <td className="px-2 py-2">
                                <Button
                                  variant="ghost"
                                  className="h-7 w-7 p-0 text-gray-600"
                                  onClick={() =>
                                    setExpandedWR((prev) => ({ ...prev, [wr.id]: !(prev[wr.id] ?? false) }))
                                  }
                                  title={open ? "Hide detailed work" : "Show detailed work"}
                                >
                                  <ChevronDown
                                    className={cn(
                                      "h-4 w-4 transition-transform",
                                      open ? "rotate-0" : "-rotate-90"
                                    )}
                                  />
                                </Button>
                              </td>
                              <td className="px-2 py-2">
                                <SmallInput
                                  value={wr.workRequired}
                                  onChange={(e) => updateWR(wr.id, { workRequired: e.target.value })}
                                  className="min-w-[260px]"
                                />
                              </td>
                              <td className="px-2 py-2">
                                <SmallInput
                                  value={wr.workstream}
                                  onChange={(e) => updateWR(wr.id, { workstream: e.target.value })}
                                  className="min-w-[140px]"
                                  placeholder="Workstream"
                                />
                              </td>
                              <td className="px-2 py-2">
                                <SmallInput
                                  value={wr.owner}
                                  onChange={(e) => updateWR(wr.id, { owner: e.target.value })}
                                  className="min-w-[140px]"
                                  placeholder="Owner"
                                />
                              </td>
                              <td className="px-2 py-2">
                                <DateInput
                                  value={wr.clientReviewDate}
                                  onChange={(iso) => updateWR(wr.id, { clientReviewDate: iso })}
                                />
                              </td>
                              <td className="px-2 py-2">
                                <DateInput
                                  value={wr.partnerReviewDate}
                                  onChange={(iso) => updateWR(wr.id, { partnerReviewDate: iso })}
                                />
                              </td>
                              <td className="px-2 py-2">
                                <div className="flex justify-end gap-2">
                                  <Button
                                    variant="outline"
                                    className="h-8 gap-2"
                                    onClick={() => addDetailedWork(wr.id)}
                                  >
                                    <Plus className="h-4 w-4" />
                                    Detailed work
                                  </Button>
                                  <Button
                                    variant="outline"
                                    className="h-8"
                                    onClick={() => onMoveWR(wr.id)}
                                    title="Move to another meeting"
                                  >
                                    Move
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    className="h-8 w-8 p-0 text-gray-600 hover:text-red-700"
                                    onClick={() => onDeleteWR(wr.id)}
                                    title="Delete work required"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </td>
                            </tr>

                            {open ? (
                              <tr className="border-t border-gray-200 bg-gray-50/40">
                                <td colSpan={7} className="px-3 py-3">
                                  <div className="flex items-center justify-between">
                                    <div className="text-xs font-semibold text-gray-700">
                                      Detailed Work (sorted by date) — workstream derived: <span className="font-normal">{wr.workstream || "—"}</span>
                                    </div>
                                    <Button
                                      variant="outline"
                                      className="h-8 gap-2"
                                      onClick={() => addDetailedWork(wr.id)}
                                    >
                                      <Plus className="h-4 w-4" />
                                      Add detailed work
                                    </Button>
                                  </div>

                                  <div className="mt-2 overflow-x-auto rounded-lg border border-gray-200 bg-white">
                                    <table className="w-full text-sm">
                                      <thead className="bg-gray-50 text-xs text-gray-600">
                                        <tr>
                                          <th className="px-2 py-2 text-left">Detailed analyses</th>
                                          <th className="px-2 py-2 text-left">Client owner</th>
                                          <th className="px-2 py-2 text-left">Client discussions</th>
                                          <th className="px-2 py-2 text-left">Date</th>
                                          <th className="px-2 py-2 text-left">Owner</th>
                                          <th className="px-2 py-2 text-left">Status</th>
                                          <th className="w-[150px] px-2 py-2 text-right">Actions</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {dws.length === 0 ? (
                                          <tr>
                                            <td colSpan={7} className="px-3 py-5 text-center text-sm text-gray-600">
                                              No Detailed Work items match the current filters.
                                            </td>
                                          </tr>
                                        ) : null}

                                        {dws.map((dw) => (
                                          <tr key={dw.id} className="border-t border-gray-200 align-top">
                                            <td className="px-2 py-2">
                                              <SmallInput
                                                value={dw.detailedAnalyses}
                                                onChange={(e) => updateDW(dw.id, { detailedAnalyses: e.target.value })}
                                                className="min-w-[260px]"
                                              />
                                            </td>
                                            <td className="px-2 py-2">
                                              <SmallInput
                                                value={dw.clientOwner}
                                                onChange={(e) => updateDW(dw.id, { clientOwner: e.target.value })}
                                                className="min-w-[160px]"
                                                placeholder="Client owner"
                                              />
                                            </td>
                                            <td className="px-2 py-2">
                                              <div className="flex items-center gap-2">
                                                <Checkbox
                                                  checked={dw.clientDiscussionsRequired}
                                                  onCheckedChange={(v) =>
                                                    updateDW(dw.id, { clientDiscussionsRequired: Boolean(v) })
                                                  }
                                                />
                                                <span className="text-xs text-gray-600">Required</span>
                                              </div>
                                            </td>
                                            <td className="px-2 py-2">
                                              <DateInput
                                                value={dw.date}
                                                onChange={(iso) => updateDW(dw.id, { date: iso })}
                                              />
                                            </td>
                                            <td className="px-2 py-2">
                                              <SmallInput
                                                value={dw.owner}
                                                onChange={(e) => updateDW(dw.id, { owner: e.target.value })}
                                                className="min-w-[140px]"
                                                placeholder="Owner"
                                              />
                                            </td>
                                            <td className="px-2 py-2">
                                              <StatusSelect
                                                value={dw.status}
                                                onChange={(s) => updateDW(dw.id, { status: s })}
                                              />
                                            </td>
                                            <td className="px-2 py-2">
                                              <div className="flex justify-end gap-2">
                                                <Button
                                                  variant="outline"
                                                  className="h-8"
                                                  onClick={() => onMoveDW(dw.id)}
                                                >
                                                  Move
                                                </Button>
                                                <Button
                                                  variant="ghost"
                                                  className="h-8 w-8 p-0 text-gray-600 hover:text-red-700"
                                                  onClick={() => onDeleteDW(dw.id)}
                                                  title="Delete detailed work"
                                                >
                                                  <Trash2 className="h-4 w-4" />
                                                </Button>
                                              </div>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </td>
                              </tr>
                            ) : null}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            ) : null}
          </Card>
        );
      })}
    </div>
  );
}

// =========================
// Detailed Work Tab
// =========================

function DetailedWorkTab({
  project,
  maps,
  deriveWorkstreamForDw,
  meetingHealth,
  updateDW,
  onMoveDW,
  onDeleteDW,
  search,
  workstreamFilter,
  ownerFilter,
}: {
  project: ProjectData;
  maps: {
    meetingById: Map<string, MajorMeeting>;
    wrById: Map<string, WorkRequired>;
    dwById: Map<string, DetailedWork>;
    wrByMeeting: Map<string, WorkRequired[]>;
    dwByWr: Map<string, DetailedWork[]>;
  };
  deriveWorkstreamForDw: (dw: DetailedWork) => string;
  meetingHealth: (meetingId: string) => MeetingHealth;
  updateDW: (dwId: string, patch: Partial<DetailedWork>) => void;
  onMoveDW: (dwId: string) => void;
  onDeleteDW: (dwId: string) => void;
  search: string;
  workstreamFilter: string;
  ownerFilter: string;
}) {
  const q = search.trim().toLowerCase();

  const rows = useMemo(() => {
    const all = project.detailedWork
      .slice()
      .sort((a, b) => compareIso(a.date, b.date))
      .map((dw) => {
        const wr = maps.wrById.get(dw.workRequiredId);
        const meeting = wr ? maps.meetingById.get(wr.meetingId) : undefined;
        const ws = wr?.workstream ?? "";
        return { dw, wr, meeting, ws };
      });

    return all.filter(({ dw, wr, meeting, ws }) => {
      const wsOk = workstreamFilter === "__all__" || ws === workstreamFilter;
      const ownOk = ownerFilter === "__all__" || dw.owner === ownerFilter;
      const txtOk =
        !q ||
        [
          dw.detailedAnalyses,
          dw.clientOwner,
          dw.owner,
          ws,
          wr?.workRequired ?? "",
          meeting?.title ?? "",
          meeting?.client ?? "",
        ].some((t) => t.toLowerCase().includes(q));
      return wsOk && ownOk && txtOk;
    });
  }, [project.detailedWork, maps, q, workstreamFilter, ownerFilter]);

  return (
    <Card className="border-gray-200 bg-white shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Detailed work</CardTitle>
        <div className="text-sm text-gray-600">All Detailed Work items (sorted by date).</div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-600">
              <tr>
                <th className="px-2 py-2 text-left">Meeting</th>
                <th className="px-2 py-2 text-left">Health</th>
                <th className="px-2 py-2 text-left">Workstream</th>
                <th className="px-2 py-2 text-left">Detailed analyses</th>
                <th className="px-2 py-2 text-left">Date</th>
                <th className="px-2 py-2 text-left">Owner</th>
                <th className="px-2 py-2 text-left">Status</th>
                <th className="w-[150px] px-2 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center text-sm text-gray-600">
                    No Detailed Work items match the current filters.
                  </td>
                </tr>
              ) : null}

              {rows.map(({ dw, wr, meeting, ws }) => {
                const mh = meeting ? meetingHealth(meeting.id) : "On track";
                return (
                  <tr key={dw.id} className="border-t border-gray-200 align-top">
                    <td className="px-2 py-2">
                      <div className="min-w-[200px]">
                        <div className="truncate font-medium">{meeting?.title ?? "—"}</div>
                        <div className="truncate text-xs text-gray-600">{wr?.workRequired ?? "—"}</div>
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      <HealthPill health={mh} />
                    </td>
                    <td className="px-2 py-2">
                      <span className="rounded-md bg-gray-50 px-2 py-1 text-xs">{ws || "—"}</span>
                    </td>
                    <td className="px-2 py-2">
                      <SmallInput
                        value={dw.detailedAnalyses}
                        onChange={(e) => updateDW(dw.id, { detailedAnalyses: e.target.value })}
                        className="min-w-[260px]"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <DateInput
                        value={dw.date}
                        onChange={(iso) => updateDW(dw.id, { date: iso })}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <SmallInput
                        value={dw.owner}
                        onChange={(e) => updateDW(dw.id, { owner: e.target.value })}
                        className="min-w-[140px]"
                        placeholder="Owner"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <StatusSelect value={dw.status} onChange={(s) => updateDW(dw.id, { status: s })} />
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" className="h-8" onClick={() => onMoveDW(dw.id)}>
                          Move
                        </Button>
                        <Button
                          variant="ghost"
                          className="h-8 w-8 p-0 text-gray-600 hover:text-red-700"
                          onClick={() => onDeleteDW(dw.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-3 text-xs text-gray-600">
          Workstream is derived from the parent Work Required and is not directly editable here.
        </div>
      </CardContent>
    </Card>
  );
}

// =========================
// Partners Review Tab
// =========================

function PartnersReviewTab({
  project,
  maps,
  meetingHealth,
  updateWR,
  onMoveWR,
  onDeleteWR,
  search,
  workstreamFilter,
  ownerFilter,
}: {
  project: ProjectData;
  maps: {
    meetingById: Map<string, MajorMeeting>;
    wrById: Map<string, WorkRequired>;
    dwById: Map<string, DetailedWork>;
    wrByMeeting: Map<string, WorkRequired[]>;
    dwByWr: Map<string, DetailedWork[]>;
  };
  meetingHealth: (meetingId: string) => MeetingHealth;
  updateWR: (wrId: string, patch: Partial<WorkRequired>) => void;
  onMoveWR: (wrId: string) => void;
  onDeleteWR: (wrId: string) => void;
  search: string;
  workstreamFilter: string;
  ownerFilter: string;
}) {
  const q = search.trim().toLowerCase();

  const rows = useMemo(() => {
    const all = project.workRequired
      .filter((w) => Boolean(w.partnerReviewDate))
      .slice()
      .sort((a, b) => compareIso(earliestReviewDate(a), earliestReviewDate(b)))
      .map((wr) => {
        const meeting = maps.meetingById.get(wr.meetingId);
        return { wr, meeting };
      });

    return all.filter(({ wr, meeting }) => {
      const wsOk = workstreamFilter === "__all__" || wr.workstream === workstreamFilter;
      const ownOk = ownerFilter === "__all__" || wr.owner === ownerFilter;
      const txtOk =
        !q ||
        [
          wr.workRequired,
          wr.workstream,
          wr.owner,
          meeting?.title ?? "",
          meeting?.client ?? "",
        ].some((t) => t.toLowerCase().includes(q));
      return wsOk && ownOk && txtOk;
    });
  }, [project.workRequired, maps, q, workstreamFilter, ownerFilter]);

  return (
    <Card className="border-gray-200 bg-white shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Review with partners</CardTitle>
        <div className="text-sm text-gray-600">
          Only Work Required rows that have a partner review date (editable here and synced everywhere).
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-600">
              <tr>
                <th className="px-2 py-2 text-left">Meeting</th>
                <th className="px-2 py-2 text-left">Health</th>
                <th className="px-2 py-2 text-left">Work required</th>
                <th className="px-2 py-2 text-left">Workstream</th>
                <th className="px-2 py-2 text-left">Owner</th>
                <th className="px-2 py-2 text-left">Partner review date</th>
                <th className="w-[160px] px-2 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-sm text-gray-600">
                    No rows match the current filters.
                  </td>
                </tr>
              ) : null}

              {rows.map(({ wr, meeting }) => {
                const mh = meeting ? meetingHealth(meeting.id) : "On track";
                return (
                  <tr key={wr.id} className="border-t border-gray-200 align-top">
                    <td className="px-2 py-2">
                      <div className="min-w-[200px]">
                        <div className="truncate font-medium">{meeting?.title ?? "—"}</div>
                        <div className="truncate text-xs text-gray-600">{meeting?.client ?? ""}</div>
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      <HealthPill health={mh} />
                    </td>
                    <td className="px-2 py-2">
                      <SmallInput
                        value={wr.workRequired}
                        onChange={(e) => updateWR(wr.id, { workRequired: e.target.value })}
                        className="min-w-[260px]"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <span className="rounded-md bg-gray-50 px-2 py-1 text-xs">{wr.workstream || "—"}</span>
                    </td>
                    <td className="px-2 py-2">
                      <SmallInput
                        value={wr.owner}
                        onChange={(e) => updateWR(wr.id, { owner: e.target.value })}
                        className="min-w-[140px]"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <DateInput
                        value={wr.partnerReviewDate}
                        onChange={(iso) => updateWR(wr.id, { partnerReviewDate: iso })}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" className="h-8" onClick={() => onMoveWR(wr.id)}>
                          Move
                        </Button>
                        <Button
                          variant="ghost"
                          className="h-8 w-8 p-0 text-gray-600 hover:text-red-700"
                          onClick={() => onDeleteWR(wr.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// =========================
// Owners / Tasks Tab
// =========================

function OwnersTasksTab({
  project,
  maps,
  deriveWorkstreamForDw,
  meetingHealth,
  updateDW,
  onMoveDW,
  onDeleteDW,
  search,
  workstreamFilter,
  ownerFilter,
}: {
  project: ProjectData;
  maps: {
    meetingById: Map<string, MajorMeeting>;
    wrById: Map<string, WorkRequired>;
    dwById: Map<string, DetailedWork>;
    wrByMeeting: Map<string, WorkRequired[]>;
    dwByWr: Map<string, DetailedWork[]>;
  };
  deriveWorkstreamForDw: (dw: DetailedWork) => string;
  meetingHealth: (meetingId: string) => MeetingHealth;
  updateDW: (dwId: string, patch: Partial<DetailedWork>) => void;
  onMoveDW: (dwId: string) => void;
  onDeleteDW: (dwId: string) => void;
  search: string;
  workstreamFilter: string;
  ownerFilter: string;
}) {
  const q = search.trim().toLowerCase();

  const rows = useMemo(() => {
    const all = project.detailedWork
      .slice()
      .sort((a, b) => compareIso(a.date, b.date))
      .map((dw) => {
        const wr = maps.wrById.get(dw.workRequiredId);
        const meeting = wr ? maps.meetingById.get(wr.meetingId) : undefined;
        const ws = wr?.workstream ?? "";
        return { dw, wr, meeting, ws };
      });

    return all.filter(({ dw, wr, meeting, ws }) => {
      const wsOk = workstreamFilter === "__all__" || ws === workstreamFilter;
      const ownOk = ownerFilter === "__all__" || dw.owner === ownerFilter;
      const txtOk =
        !q ||
        [
          dw.detailedAnalyses,
          dw.owner,
          ws,
          wr?.workRequired ?? "",
          meeting?.title ?? "",
        ].some((t) => t.toLowerCase().includes(q));
      return wsOk && ownOk && txtOk;
    });
  }, [project.detailedWork, maps, q, workstreamFilter, ownerFilter]);

  return (
    <Card className="border-gray-200 bg-white shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Owners / tasks</CardTitle>
        <div className="text-sm text-gray-600">
          Focus view for owners. Inline edit: Date, Owner, Status. Move action available.
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-600">
              <tr>
                <th className="px-2 py-2 text-left">Workstream</th>
                <th className="px-2 py-2 text-left">Detailed work</th>
                <th className="px-2 py-2 text-left">Date</th>
                <th className="px-2 py-2 text-left">Owner</th>
                <th className="px-2 py-2 text-left">Status</th>
                <th className="px-2 py-2 text-left">Meeting health</th>
                <th className="w-[150px] px-2 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-sm text-gray-600">
                    No tasks match the current filters.
                  </td>
                </tr>
              ) : null}

              {rows.map(({ dw, meeting, ws }) => {
                const mh = meeting ? meetingHealth(meeting.id) : "On track";
                return (
                  <tr key={dw.id} className="border-t border-gray-200 align-top">
                    <td className="px-2 py-2">
                      <span className="rounded-md bg-gray-50 px-2 py-1 text-xs">{ws || "—"}</span>
                    </td>
                    <td className="px-2 py-2">
                      <div className="min-w-[280px]">
                        <div className="font-medium">{dw.detailedAnalyses}</div>
                        <div className="truncate text-xs text-gray-600">{meeting?.title ?? ""}</div>
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      <DateInput
                        value={dw.date}
                        onChange={(iso) => updateDW(dw.id, { date: iso })}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <SmallInput
                        value={dw.owner}
                        onChange={(e) => updateDW(dw.id, { owner: e.target.value })}
                        className="min-w-[140px]"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <StatusSelect
                        value={dw.status}
                        onChange={(s) => updateDW(dw.id, { status: s })}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <HealthPill health={mh} />
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" className="h-8" onClick={() => onMoveDW(dw.id)}>
                          Move
                        </Button>
                        <Button
                          variant="ghost"
                          className="h-8 w-8 p-0 text-gray-600 hover:text-red-700"
                          onClick={() => onDeleteDW(dw.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-3 text-xs text-gray-600">
          Workstream is derived from parent Work Required.
        </div>
      </CardContent>
    </Card>
  );
}

// =========================
// Calendar Tab (Month grid + Day view + Executive weekly toggle)
// =========================

type CalItem = {
  key: string;
  label: string;
  kind: DragPayload["kind"];
  id: string;
  className: string;
  health?: MeetingHealth;
};

function CalendarTab({
  project,
  maps,
  deriveWorkstreamForDw,
  meetingHealth,
  search,
  workstreamFilter,
  ownerFilter,
  reschedule,
}: {
  project: ProjectData;
  maps: {
    meetingById: Map<string, MajorMeeting>;
    wrById: Map<string, WorkRequired>;
    dwById: Map<string, DetailedWork>;
    wrByMeeting: Map<string, WorkRequired[]>;
    dwByWr: Map<string, DetailedWork[]>;
  };
  deriveWorkstreamForDw: (dw: DetailedWork) => string;
  meetingHealth: (meetingId: string) => MeetingHealth;
  search: string;
  workstreamFilter: string;
  ownerFilter: string;
  reschedule: (payload: DragPayload, targetIso: string) => void;
}) {
  const today = todayIsoLocal();
  const [mode, setMode] = useState<CalendarMode>("month");
  const [cursorIso, setCursorIso] = useState<string>(today); // controls month
  const [weekStartIsoState, setWeekStartIsoState] = useState<string>(startOfWeekIso(today));
  const [dayViewIso, setDayViewIso] = useState<string | null>(null);

  const q = search.trim().toLowerCase();

  const matchText = (texts: string[]) => {
    if (!q) return true;
    return texts.some((t) => t.toLowerCase().includes(q));
  };

  const meetingRelevantToWorkstream = (meetingId: string, ws: string) => {
    const wrs = maps.wrByMeeting.get(meetingId) ?? [];
    return wrs.some((wr) => wr.workstream === ws);
  };

  const calendarItemsByDay = useMemo(() => {
    // Build a map of ISO date -> items
    const map = new Map<string, CalItem[]>();

    const add = (iso: string | null, item: CalItem) => {
      if (!iso) return;
      const arr = map.get(iso) ?? [];
      arr.push(item);
      map.set(iso, arr);
    };

    // Meetings
    for (const m of project.meetings) {
      // filter by workstream/owner/search
      const wsOk =
        workstreamFilter === "__all__" ||
        meetingRelevantToWorkstream(m.id, workstreamFilter);
      const ownOk =
        ownerFilter === "__all__" ||
        (maps.wrByMeeting.get(m.id) ?? []).some((wr) => wr.owner === ownerFilter) ||
        (maps.wrByMeeting.get(m.id) ?? []).some((wr) =>
          (maps.dwByWr.get(wr.id) ?? []).some((dw) => dw.owner === ownerFilter)
        );
      const txtOk = matchText([m.title, m.client, m.agenda]);
      if (!wsOk || !ownOk || !txtOk) continue;

      const health = meetingHealth(m.id);
      add(m.meetingDate, {
        key: `m:${m.id}`,
        label: `Meeting: ${m.title}`,
        kind: "meeting",
        id: m.id,
        className: cn("border", DISCUSSION.detailed),
        health,
      });
    }

    // Work Required reviews
    for (const wr of project.workRequired) {
      const meeting = maps.meetingById.get(wr.meetingId);
      const wsOk = workstreamFilter === "__all__" || wr.workstream === workstreamFilter;
      const ownOk = ownerFilter === "__all__" || wr.owner === ownerFilter;
      const txtOk = matchText([
        wr.workRequired,
        wr.workstream,
        wr.owner,
        meeting?.title ?? "",
        meeting?.client ?? "",
      ]);
      if (!wsOk || !ownOk || !txtOk) continue;

      add(wr.clientReviewDate, {
        key: `cr:${wr.id}`,
        label: `Client review: ${wr.workRequired}`,
        kind: "clientReview",
        id: wr.id,
        className: cn("border", DISCUSSION.client),
      });
      add(wr.partnerReviewDate, {
        key: `pr:${wr.id}`,
        label: `Partner review: ${wr.workRequired}`,
        kind: "partnerReview",
        id: wr.id,
        className: cn("border", DISCUSSION.partner),
      });
    }

    // Detailed work
    for (const dw of project.detailedWork) {
      const wr = maps.wrById.get(dw.workRequiredId);
      const meeting = wr ? maps.meetingById.get(wr.meetingId) : undefined;
      const ws = wr?.workstream ?? "";
      const wsOk = workstreamFilter === "__all__" || ws === workstreamFilter;
      const ownOk = ownerFilter === "__all__" || dw.owner === ownerFilter;
      const txtOk = matchText([
        dw.detailedAnalyses,
        dw.clientOwner,
        dw.owner,
        ws,
        wr?.workRequired ?? "",
        meeting?.title ?? "",
      ]);
      if (!wsOk || !ownOk || !txtOk) continue;

      add(dw.date, {
        key: `dw:${dw.id}`,
        label: `Detailed: ${dw.detailedAnalyses}`,
        kind: "detailed",
        id: dw.id,
        className: cn("border", DISCUSSION.detailed),
      });
    }

    // Sort each day's items (meetings, reviews, then detailed)
    for (const [iso, items] of map.entries()) {
      items.sort((a, b) => {
        const order = (k: CalItem["kind"]) =>
          k === "meeting" ? 0 : k === "clientReview" ? 1 : k === "partnerReview" ? 2 : 3;
        return order(a.kind) - order(b.kind) || a.label.localeCompare(b.label);
      });
      map.set(iso, items);
    }

    return map;
  }, [
    project.meetings,
    project.workRequired,
    project.detailedWork,
    maps,
    meetingHealth,
    workstreamFilter,
    ownerFilter,
    q,
  ]);

  const monthIso = monthStartIso(cursorIso);

  // Month grid range
  const monthGrid = useMemo(() => {
    const [y, m] = monthIso.split("-").map(Number);
    const first = new Date(y, m - 1, 1);
    const startDow = (first.getDay() + 6) % 7; // Monday=0
    const gridStart = new Date(y, m - 1, 1 - startDow);

    const days: { iso: string; inMonth: boolean }[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      const iso = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
      days.push({
        iso,
        inMonth: d.getMonth() === m - 1,
      });
    }
    return days;
  }, [monthIso]);

  const weekDays = useMemo(() => {
    const start = weekStartIsoState;
    return Array.from({ length: 7 }, (_, i) => ({
      iso: addDaysIso(start, i),
      inMonth: true,
    }));
  }, [weekStartIsoState]);

  const renderDayCell = ({ iso, inMonth }: { iso: string; inMonth: boolean }) => {
    const items = calendarItemsByDay.get(iso) ?? [];

    const counts = {
      meetings: items.filter((i) => i.kind === "meeting").length,
      client: items.filter((i) => i.kind === "clientReview").length,
      partner: items.filter((i) => i.kind === "partnerReview").length,
      detailed: items.filter((i) => i.kind === "detailed").length,
    };

    const isToday = iso === today;

    const onDrop = (e: React.DragEvent) => {
      e.preventDefault();
      const raw = e.dataTransfer.getData("text/plain");
      try {
        const payload = JSON.parse(raw) as DragPayload;
        if (!payload?.kind || !payload?.id) return;
        reschedule(payload, iso);
      } catch {
        // ignore
      }
    };

    return (
      <div
        key={iso}
        className={cn(
          "group flex min-h-[120px] flex-col gap-2 rounded-lg border border-gray-200 bg-white p-2",
          !inMonth ? "bg-gray-50 text-gray-400" : "",
          isToday ? "ring-2 ring-gray-300" : ""
        )}
        onClick={() => setDayViewIso(iso)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        title="Click for day view. Drag items onto a day to reschedule."
      >
        <div className="flex items-center justify-between">
          <div className={cn("text-xs font-semibold", inMonth ? "text-gray-900" : "text-gray-400")}>
            {isoToDDMMYYYY(iso)}
          </div>
          <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <DotCount label="Meet" count={counts.meetings} className={DISCUSSION.detailed} />
            <DotCount label="Client" count={counts.client} className={DISCUSSION.client} />
            <DotCount label="Partner" count={counts.partner} className={DISCUSSION.partner} />
            <DotCount label="DW" count={counts.detailed} className={DISCUSSION.detailed} />
          </div>
        </div>

        <div className="space-y-1">
          {items.slice(0, 4).map((it) => (
            <CalendarChip key={it.key} item={it} />
          ))}
          {items.length > 4 ? (
            <div className="text-xs text-gray-500">+{items.length - 4} more</div>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-gray-700" />
          <div className="font-semibold">Calendar</div>
          <Pill
            label={mode === "month" ? "Month" : "Executive week"}
            className="border-gray-200 bg-gray-50 text-gray-800"
          />
          <div className="hidden text-sm text-gray-600 md:block">
            Drag and drop meetings, reviews, and detailed work to reschedule.
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={mode === "month" ? "default" : "outline"}
            className="h-8"
            onClick={() => setMode("month")}
          >
            Month
          </Button>
          <Button
            variant={mode === "week" ? "default" : "outline"}
            className="h-8"
            onClick={() => setMode("week")}
          >
            Executive weekly view
          </Button>

          <Separator orientation="vertical" className="hidden h-6 md:block" />

          {mode === "month" ? (
            <>
              <Button variant="outline" className="h-8" onClick={() => setCursorIso(addDaysIso(monthIso, -1))} title="Previous month">
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" className="h-8" onClick={() => setCursorIso(addDaysIso(monthIso, 32))} title="Next month">
                <ChevronsRight className="h-4 w-4" />
              </Button>
              <div className="min-w-[200px] text-sm font-medium">{monthLabel(monthIso)}</div>
              <Button
                variant="outline"
                className="h-8"
                onClick={() => setCursorIso(today)}
              >
                Today
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" className="h-8" onClick={() => setWeekStartIsoState(addWeeksIso(weekStartIsoState, -1))} title="Previous week">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" className="h-8" onClick={() => setWeekStartIsoState(addWeeksIso(weekStartIsoState, 1))} title="Next week">
                <ChevronRight className="h-4 w-4" />
              </Button>
              <div className="min-w-[220px] text-sm font-medium">
                Week of {isoToDDMMYYYY(weekStartIsoState)}
              </div>
              <Button variant="outline" className="h-8" onClick={() => setWeekStartIsoState(startOfWeekIso(today))}>
                This week
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Color legend */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Pill label="Client discussions/reviews" className={DISCUSSION.client} />
        <Pill label="Partner discussions/reviews" className={DISCUSSION.partner} />
        <Pill label="Detailed work" className={DISCUSSION.detailed} />
        <div className="ml-1 text-gray-600">Status colors: Delayed (red), In Progress (yellow), Completed (green).</div>
      </div>

      {mode === "month" ? (
        <div className="grid grid-cols-1 gap-3">
          <div className="grid grid-cols-7 gap-2">
            {[
              "Mon",
              "Tue",
              "Wed",
              "Thu",
              "Fri",
              "Sat",
              "Sun",
            ].map((d) => (
              <div key={d} className="px-2 text-xs font-semibold text-gray-600">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-2">
            {monthGrid.map(renderDayCell)}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-7 gap-2">
            {weekDays.map(({ iso }) => (
              <div key={iso} className="px-2 text-xs font-semibold text-gray-600">
                {isoDayLabel(iso)}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-2">
            {weekDays.map(renderDayCell)}
          </div>

          <ExecutiveSummary
            weekStartIso={weekStartIsoState}
            calendarItemsByDay={calendarItemsByDay}
            project={project}
            maps={maps}
            meetingHealth={meetingHealth}
            workstreamFilter={workstreamFilter}
          />
        </div>
      )}

      <DayViewDialog
        open={Boolean(dayViewIso)}
        onOpenChange={(o) => !o && setDayViewIso(null)}
        iso={dayViewIso}
        project={project}
        maps={maps}
        deriveWorkstreamForDw={deriveWorkstreamForDw}
        meetingHealth={meetingHealth}
        calendarItems={dayViewIso ? calendarItemsByDay.get(dayViewIso) ?? [] : []}
        reschedule={reschedule}
      />
    </div>
  );
}

function CalendarChip({ item }: { item: CalItem }) {
  const onDragStart = (e: React.DragEvent) => {
    const payload: DragPayload = { kind: item.kind, id: item.id } as DragPayload;
    e.dataTransfer.setData("text/plain", JSON.stringify(payload));
    e.dataTransfer.effectAllowed = "move";
  };

  return (
    <div
      draggable
      onDragStart={onDragStart}
      className={cn(
        "flex cursor-grab items-center gap-2 rounded-md px-2 py-1 text-xs",
        item.className
      )}
      title="Drag to another day"
      onClick={(e) => e.stopPropagation()}
    >
      <GripVertical className="h-3 w-3 opacity-60" />
      <div className="min-w-0 flex-1 truncate">
        {item.label}
      </div>
      {item.kind === "meeting" && item.health ? (
        <span
          className={cn(
            "ml-2 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px]",
            HEALTH_META[item.health].pill
          )}
        >
          <span className={cn("h-1.5 w-1.5 rounded-full", HEALTH_META[item.health].dot)} />
          {item.health}
        </span>
      ) : null}
    </div>
  );
}

function DayViewDialog({
  open,
  onOpenChange,
  iso,
  project,
  maps,
  deriveWorkstreamForDw,
  meetingHealth,
  calendarItems,
  reschedule,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  iso: string | null;
  project: ProjectData;
  maps: {
    meetingById: Map<string, MajorMeeting>;
    wrById: Map<string, WorkRequired>;
    dwById: Map<string, DetailedWork>;
    wrByMeeting: Map<string, WorkRequired[]>;
    dwByWr: Map<string, DetailedWork[]>;
  };
  deriveWorkstreamForDw: (dw: DetailedWork) => string;
  meetingHealth: (meetingId: string) => MeetingHealth;
  calendarItems: CalItem[];
  reschedule: (payload: DragPayload, targetIso: string) => void;
}) {
  if (!iso) return null;

  // Build day lists without double counting: DW with client discussions required shows under Client section.
  const meetings = calendarItems.filter((i) => i.kind === "meeting");
  const clientReviews = calendarItems.filter((i) => i.kind === "clientReview");
  const partnerReviews = calendarItems.filter((i) => i.kind === "partnerReview");

  const detailedAll = calendarItems.filter((i) => i.kind === "detailed");

  // Client discussions derived from DetailedWork flag
  const clientDiscussionDW: CalItem[] = [];
  const detailedNoClientDiscussion: CalItem[] = [];

  for (const it of detailedAll) {
    const dw = maps.dwById.get(it.id);
    if (dw?.clientDiscussionsRequired) clientDiscussionDW.push(it);
    else detailedNoClientDiscussion.push(it);
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData("text/plain");
    try {
      const payload = JSON.parse(raw) as DragPayload;
      if (!payload?.kind || !payload?.id) return;
      reschedule(payload, iso);
    } catch {
      // ignore
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[980px] bg-white" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
        <DialogHeader>
          <DialogTitle>Day view — {isoToDDMMYYYY(iso)}</DialogTitle>
          <DialogDescription>
            Drag any item and drop it onto another day (month/week view) to reschedule. Health is shown for meetings.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 md:grid-cols-3">
          <DaySection title="Meetings" items={meetings} kindHint="Meeting" />

          <DaySection
            title="Client discussions / reviews"
            items={[...clientReviews, ...clientDiscussionDW]}
            kindHint="Client"
          />

          <DaySection title="Partner discussions / reviews" items={partnerReviews} kindHint="Partner" />
        </div>

        <Separator />

        <div>
          <div className="mb-2 text-sm font-semibold">Detailed work (grey)</div>
          <div className="space-y-2">
            {detailedNoClientDiscussion.length === 0 ? (
              <div className="text-sm text-gray-600">No detailed work items for this day.</div>
            ) : null}
            {detailedNoClientDiscussion.map((it) => (
              <CalendarChip key={it.key} item={it} />
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DaySection({
  title,
  items,
}: {
  title: string;
  items: CalItem[];
  kindHint: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50/40 p-3">
      <div className="mb-2 text-sm font-semibold">{title}</div>
      <div className="space-y-2">
        {items.length === 0 ? (
          <div className="text-sm text-gray-600">None</div>
        ) : null}
        {items.map((it) => (
          <CalendarChip key={it.key} item={it} />
        ))}
      </div>
    </div>
  );
}

function ExecutiveSummary({
  weekStartIso,
  calendarItemsByDay,
  project,
  maps,
  meetingHealth,
  workstreamFilter,
}: {
  weekStartIso: string;
  calendarItemsByDay: Map<string, CalItem[]>;
  project: ProjectData;
  maps: {
    meetingById: Map<string, MajorMeeting>;
    wrById: Map<string, WorkRequired>;
    dwById: Map<string, DetailedWork>;
    wrByMeeting: Map<string, WorkRequired[]>;
    dwByWr: Map<string, DetailedWork[]>;
  };
  meetingHealth: (meetingId: string) => MeetingHealth;
  workstreamFilter: string;
}) {
  // Workstream-wise weekly summary
  const days = Array.from({ length: 7 }, (_, i) => addDaysIso(weekStartIso, i));

  const workstreams = uniqSorted(project.workRequired.map((w) => w.workstream).filter(Boolean));
  const streams = workstreamFilter === "__all__" ? workstreams : [workstreamFilter];

  const byStream = streams.map((ws) => {
    const weekDW: DetailedWork[] = [];
    const weekClient: WorkRequired[] = [];
    const weekPartner: WorkRequired[] = [];
    const weekMeetings: MajorMeeting[] = [];

    for (const iso of days) {
      const items = calendarItemsByDay.get(iso) ?? [];

      // Detailed work
      for (const it of items.filter((x) => x.kind === "detailed")) {
        const dw = maps.dwById.get(it.id);
        const wr = dw ? maps.wrById.get(dw.workRequiredId) : undefined;
        if (!dw || !wr) continue;
        if ((wr.workstream ?? "") === ws) weekDW.push(dw);
      }

      // Reviews
      for (const it of items.filter((x) => x.kind === "clientReview")) {
        const wr = maps.wrById.get(it.id);
        if (wr && wr.workstream === ws) weekClient.push(wr);
      }
      for (const it of items.filter((x) => x.kind === "partnerReview")) {
        const wr = maps.wrById.get(it.id);
        if (wr && wr.workstream === ws) weekPartner.push(wr);
      }

      // Meetings: attribute meeting to this stream if any WR in meeting has the stream
      for (const it of items.filter((x) => x.kind === "meeting")) {
        const m = maps.meetingById.get(it.id);
        if (!m) continue;
        const wrs = maps.wrByMeeting.get(m.id) ?? [];
        if (wrs.some((w) => w.workstream === ws)) weekMeetings.push(m);
      }
    }

    const uniqById = <T extends { id: string }>(arr: T[]) => {
      const seen = new Set<string>();
      return arr.filter((x) => {
        if (seen.has(x.id)) return false;
        seen.add(x.id);
        return true;
      });
    };

    return {
      ws,
      dw: uniqById(weekDW).slice().sort((a, b) => compareIso(a.date, b.date)),
      client: uniqById(weekClient).slice().sort((a, b) => compareIso(a.clientReviewDate, b.clientReviewDate)),
      partner: uniqById(weekPartner).slice().sort((a, b) => compareIso(a.partnerReviewDate, b.partnerReviewDate)),
      meetings: uniqById(weekMeetings).slice().sort((a, b) => compareIso(a.meetingDate, b.meetingDate)),
    };
  });

  return (
    <Card className="border-gray-200 bg-white shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Executive weekly summary</CardTitle>
        <div className="text-sm text-gray-600">
          Workstream-wise summary for the week. Key analyses, plus client & partner touchpoints.
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 lg:grid-cols-2">
          {byStream.length === 0 ? (
            <div className="text-sm text-gray-600">No workstreams found.</div>
          ) : null}

          {byStream.map((s) => (
            <div key={s.ws} className="rounded-lg border border-gray-200 bg-gray-50/40 p-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-sm font-semibold">{s.ws || "(No workstream)"}</div>
                <div className="flex items-center gap-2 text-xs">
                  <Pill label={`Analyses: ${s.dw.length}`} className={DISCUSSION.detailed} />
                  <Pill label={`Client: ${s.client.length}`} className={DISCUSSION.client} />
                  <Pill label={`Partner: ${s.partner.length}`} className={DISCUSSION.partner} />
                </div>
              </div>

              <div className="grid gap-2 md:grid-cols-2">
                <div>
                  <div className="mb-1 text-xs font-semibold text-gray-700">Key analyses</div>
                  <div className="space-y-1">
                    {s.dw.slice(0, 5).map((dw) => (
                      <div key={dw.id} className={cn("rounded-md border px-2 py-1 text-xs", DISCUSSION.detailed)}>
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0 flex-1 truncate">{dw.detailedAnalyses}</div>
                          <StatusPill status={dw.status} />
                        </div>
                      </div>
                    ))}
                    {s.dw.length > 5 ? (
                      <div className="text-xs text-gray-500">+{s.dw.length - 5} more</div>
                    ) : null}
                    {s.dw.length === 0 ? <div className="text-xs text-gray-600">None</div> : null}
                  </div>
                </div>

                <div>
                  <div className="mb-1 text-xs font-semibold text-gray-700">Key meetings & reviews</div>
                  <div className="space-y-1">
                    {s.meetings.slice(0, 4).map((m) => (
                      <div key={m.id} className={cn("rounded-md border px-2 py-1 text-xs", DISCUSSION.detailed)}>
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0 flex-1 truncate">{m.title}</div>
                          <HealthPill health={meetingHealth(m.id)} />
                        </div>
                      </div>
                    ))}

                    {s.client.slice(0, 3).map((wr) => (
                      <div key={wr.id + "_c"} className={cn("rounded-md border px-2 py-1 text-xs", DISCUSSION.client)}>
                        <div className="truncate">Client review: {wr.workRequired}</div>
                      </div>
                    ))}

                    {s.partner.slice(0, 3).map((wr) => (
                      <div key={wr.id + "_p"} className={cn("rounded-md border px-2 py-1 text-xs", DISCUSSION.partner)}>
                        <div className="truncate">Partner review: {wr.workRequired}</div>
                      </div>
                    ))}

                    {s.meetings.length + s.client.length + s.partner.length === 0 ? (
                      <div className="text-xs text-gray-600">None</div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// =========================
// Move dialogs
// =========================

function MoveWorkRequiredDialog({
  open,
  onOpenChange,
  project,
  wrId,
  maps,
  onMove,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  project: ProjectData;
  wrId: string | null;
  maps: {
    meetingById: Map<string, MajorMeeting>;
    wrById: Map<string, WorkRequired>;
    dwById: Map<string, DetailedWork>;
    wrByMeeting: Map<string, WorkRequired[]>;
    dwByWr: Map<string, DetailedWork[]>;
  };
  onMove: (wrId: string, meetingId: string) => void;
}) {
  const wr = wrId ? maps.wrById.get(wrId) : undefined;
  const [meetingId, setMeetingId] = useState<string>(wr?.meetingId ?? "");

  useEffect(() => {
    setMeetingId(wr?.meetingId ?? "");
  }, [wr?.meetingId, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white">
        <DialogHeader>
          <DialogTitle>Move Work Required</DialogTitle>
          <DialogDescription>
            Move this Work Required row (and all linked Detailed Work) to another meeting.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <div className="text-sm font-medium">Target meeting</div>
          <Select value={meetingId} onValueChange={setMeetingId}>
            <SelectTrigger className="h-9 bg-white text-black">
              <SelectValue placeholder="Select meeting" />
            </SelectTrigger>
            <SelectContent>
              {project.meetings
                .slice()
                .sort((a, b) => compareIso(a.meetingDate, b.meetingDate))
                .map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.title}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (!wrId || !meetingId) return;
              onMove(wrId, meetingId);
              onOpenChange(false);
            }}
          >
            Move
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MoveDetailedWorkDialog({
  open,
  onOpenChange,
  project,
  dwId,
  maps,
  onMove,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  project: ProjectData;
  dwId: string | null;
  maps: {
    meetingById: Map<string, MajorMeeting>;
    wrById: Map<string, WorkRequired>;
    dwById: Map<string, DetailedWork>;
    wrByMeeting: Map<string, WorkRequired[]>;
    dwByWr: Map<string, DetailedWork[]>;
  };
  onMove: (dwId: string, wrId: string) => void;
}) {
  const dw = dwId ? maps.dwById.get(dwId) : undefined;
  const currentWR = dw ? maps.wrById.get(dw.workRequiredId) : undefined;

  const [meetingId, setMeetingId] = useState<string>(currentWR?.meetingId ?? "");
  const [wrId, setWrId] = useState<string>(dw?.workRequiredId ?? "");

  useEffect(() => {
    setMeetingId(currentWR?.meetingId ?? "");
    setWrId(dw?.workRequiredId ?? "");
  }, [open, currentWR?.meetingId, dw?.workRequiredId]);

  const meetingWRs = useMemo(() => {
    if (!meetingId) return [] as WorkRequired[];
    return project.workRequired
      .filter((w) => w.meetingId === meetingId)
      .slice()
      .sort((a, b) => compareIso(earliestReviewDate(a), earliestReviewDate(b)));
  }, [project.workRequired, meetingId]);

  useEffect(() => {
    // Ensure wrId belongs to meetingId
    if (wrId && meetingWRs.some((w) => w.id === wrId)) return;
    if (meetingWRs.length) setWrId(meetingWRs[0].id);
  }, [meetingWRs, wrId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white">
        <DialogHeader>
          <DialogTitle>Move Detailed Work</DialogTitle>
          <DialogDescription>
            Move this Detailed Work item to another Work Required (choose Meeting → Work Required).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <div className="mb-1 text-sm font-medium">Target meeting</div>
            <Select value={meetingId} onValueChange={setMeetingId}>
              <SelectTrigger className="h-9 bg-white text-black">
                <SelectValue placeholder="Select meeting" />
              </SelectTrigger>
              <SelectContent>
                {project.meetings
                  .slice()
                  .sort((a, b) => compareIso(a.meetingDate, b.meetingDate))
                  .map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.title}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <div className="mb-1 text-sm font-medium">Target work required</div>
            <Select value={wrId} onValueChange={setWrId}>
              <SelectTrigger className="h-9 bg-white text-black">
                <SelectValue placeholder="Select work required" />
              </SelectTrigger>
              <SelectContent>
                {meetingWRs.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.workRequired}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (!dwId || !wrId) return;
              onMove(dwId, wrId);
              onOpenChange(false);
            }}
          >
            Move
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
