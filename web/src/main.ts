import { bootstrapApplication } from "@angular/platform-browser";
import {
  Component,
  signal,
  computed,
  effect,
  HostListener,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  title: string;
}
interface Project {
  id: string;
  name: string;
  client_name: string;
  description: string;
  status: string;
  ticket_count: number;
  completed_count: number;
}
interface Ticket {
  id: string;
  number: number;
  project_id: string;
  title: string;
  description: string;
  acceptance_criteria: string;
  links: string[];
  status: string;
  priority: string;
  assignee_id: string | null;
  assignee_name?: string;
  comment_count: number;
  asset_count: number;
  created_at: string;
  updated_at: string;
  comments?: any[];
  assets?: any[];
  history?: any[];
}
@Component({
  selector: "app-root",
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: "./app.html",
})
export class App {
  api = (window as any).KRAKEN_CONFIG?.apiUrl || "http://localhost:4000/api";
  token = signal(sessionStorage.getItem("kraken-session") || "");
  user = signal<User | null>(null);
  loading = signal(true);
  busy = signal(false);
  error = signal("");
  notice = signal("");
  page = signal("board");
  projects = signal<Project[]>([]);
  selectedProject = signal("");
  tickets = signal<Ticket[]>([]);
  members = signal<any[]>([]);
  history = signal<any[]>([]);
  estimates = signal<any[]>([]);
  team = signal<any>({ users: [], invitations: [] });
  project = computed(() =>
    this.projects().find((p) => p.id === this.selectedProject()),
  );
  admin = computed(() => this.user()?.role === "admin");
  canMove = computed(() =>
    ["admin", "developer"].includes(this.user()?.role || ""),
  );
  search = signal("");
  priority = signal("all");
  view = signal("board");
  modal = signal("");
  detail = signal<Ticket | null>(null);
  editing = signal(false);
  dragging = "";
  states = [
    { id: "backlog", label: "Backlog", color: "#8b98aa" },
    { id: "active", label: "Active", color: "#00b4c5" },
    { id: "in_review", label: "In review", color: "#aa89dc" },
    { id: "solved", label: "Solved", color: "#47ab86" },
    { id: "closed", label: "Closed", color: "#677e94" },
  ];
  visible = computed(() =>
    this.tickets().filter(
      (t) =>
        (this.priority() === "all" || t.priority === this.priority()) &&
        `${t.title} DK-${t.number} ${t.description}`
          .toLowerCase()
          .includes(this.search().toLowerCase()),
    ),
  );
  completed = computed(
    () =>
      this.tickets().filter((t) => ["solved", "closed"].includes(t.status))
        .length,
  );
  login = { email: "", password: "" };
  invitePassword = "";
  inviteName = "";
  hashParams = new URLSearchParams(location.hash.slice(1));
  inviteToken = this.hashParams.get("invite");
  approvalToken = this.hashParams.get("approve");
  approval = signal<any>(null);
  approvalName = "";
  approvalAccepted = false;
  projectForm = { name: "", client_name: "", description: "" };
  ticketForm = {
    title: "",
    description: "",
    acceptance_criteria: "",
    links: "",
    priority: "medium",
    assignee_id: "",
  };
  comment = "";
  estimateForm = {
    project_id: "",
    title: "",
    client_email: "",
    currency: "USD",
    notes: "",
    items: [{ description: "", quantity: 1, rate: 0 }],
  };
  invitationForm = {
    name: "",
    email: "",
    role: "developer",
    title: "",
    project_ids: [] as string[],
  };
  memberId = "";
  private previousFocus: HTMLElement | null = null;
  constructor() {
    this.init();
    effect((onCleanup) => {
      const open = this.modal();
      if (open) {
        this.previousFocus = document.activeElement as HTMLElement;
        const timer = setTimeout(
          () =>
            document
              .querySelector<HTMLElement>(
                ".modal input,.modal select,.modal textarea,.modal-close",
              )
              ?.focus(),
          0,
        );
        onCleanup(() => clearTimeout(timer));
      }
    });
  }
  @HostListener("document:keydown", ["$event"]) keyboard(event: KeyboardEvent) {
    if (this.modal() && event.key === "Tab") {
      const items = Array.from(
        document.querySelectorAll<HTMLElement>(
          ".modal button:not([disabled]),.modal input:not([disabled]),.modal select:not([disabled]),.modal textarea:not([disabled]),.modal a[href]",
        ),
      ).filter((el) => el.offsetParent !== null);
      const first = items[0],
        last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    } else if (
      event.key === "/" &&
      !this.modal() &&
      !["INPUT", "TEXTAREA", "SELECT"].includes(
        (event.target as HTMLElement)?.tagName,
      )
    ) {
      event.preventDefault();
      document
        .querySelector<HTMLInputElement>('[aria-label="Search tickets"]')
        ?.focus();
    }
  }

  async request(
    path: string,
    method = "GET",
    body?: unknown,
    blob = false,
  ): Promise<any> {
    const headers: any = {};
    if (this.token()) headers.Authorization = `Bearer ${this.token()}`;
    if (body && !(body instanceof FormData))
      headers["Content-Type"] = "application/json";
    let response: Response;
    try {
      response = await fetch(this.api + path, {
        method,
        headers,
        body:
          body instanceof FormData
            ? body
            : body
              ? JSON.stringify(body)
              : undefined,
      });
    } catch {
      throw new Error(
        "Cannot reach the portal. Check your connection and try again.",
      );
    }
    if (!response.ok) {
      let message = "Request failed";
      try {
        message = (await response.json()).error || message;
      } catch {}
      if (response.status === 401) {
        this.clearSession();
      }
      throw new Error(message);
    }
    if (
      response.status === 204 ||
      (response.status === 201 &&
        response.headers.get("content-length") === "7")
    )
      return null;
    if (blob) return response.blob();
    const content = response.headers.get("content-type");
    return content?.includes("json") ? response.json() : null;
  }
  async run(fn: () => Promise<void>) {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set("");
    try {
      await fn();
    } catch (e: any) {
      this.error.set(e.message);
    } finally {
      this.busy.set(false);
    }
  }
  async init() {
    try {
      if (this.approvalToken)
        this.approval.set(
          await this.request(`/approval/${this.approvalToken}`),
        );
      else if (this.token()) {
        this.user.set(await this.request("/auth/me"));
        await this.refresh();
      }
    } catch (e: any) {
      this.error.set(e.message);
    } finally {
      this.loading.set(false);
    }
  }
  async refresh() {
    this.projects.set(await this.request("/projects"));
    if (
      !this.selectedProject() ||
      !this.projects().some((p) => p.id === this.selectedProject())
    )
      this.selectedProject.set(this.projects()[0]?.id || "");
    await this.loadProject();
    if (this.user()?.role !== "developer")
      this.estimates.set(await this.request("/estimates"));
    else this.estimates.set([]);
  }
  async loadProject() {
    if (!this.selectedProject()) {
      this.tickets.set([]);
      this.members.set([]);
      this.history.set([]);
      return;
    }
    const pid = this.selectedProject();
    const [tickets, members, history] = await Promise.all([
      this.request(`/projects/${pid}/tickets`),
      this.request(`/projects/${pid}/members`),
      this.request(`/projects/${pid}/history`),
    ]);
    if (pid !== this.selectedProject()) return;
    this.tickets.set(tickets);
    this.members.set(members);
    this.history.set(history);
  }
  signIn() {
    this.run(async () => {
      const result = await this.request("/auth/login", "POST", this.login);
      this.token.set(result.token);
      sessionStorage.setItem("kraken-session", result.token);
      this.user.set(result.user);
      this.login.password = "";
      await this.refresh();
    });
  }
  clearSession() {
    this.token.set("");
    this.user.set(null);
    sessionStorage.removeItem("kraken-session");
    this.projects.set([]);
    this.selectedProject.set("");
    this.tickets.set([]);
    this.estimates.set([]);
    this.members.set([]);
    this.history.set([]);
    this.team.set({users: [], invitations: []});
    this.detail.set(null);
    this.modal.set("");
    this.page.set("board");
  }
  countState(status: string) {
    return this.tickets().filter(ticket => ticket.status === status).length;
  }
  signOut() {
    this.run(async () => {
      await this.request("/auth/logout", "POST");
      this.clearSession();
    });
  }
  acceptInvite() {
    this.run(async () => {
      await this.request("/auth/accept-invitation", "POST", {
        token: this.inviteToken,
        password: this.invitePassword,
        name: this.inviteName,
      });
      this.inviteToken = null;
      this.invitePassword = "";
      history.replaceState(null, "", location.pathname);
      this.notice.set("Account created. Sign in to continue.");
    });
  }
  approvePublic() {
    this.run(async () => {
      await this.request(`/approval/${this.approvalToken}`, "POST", {
        name: this.approvalName,
        accepted: this.approvalAccepted,
      });
      this.approval.set(await this.request(`/approval/${this.approvalToken}`));
    });
  }
  navigate(page: string) {
    this.page.set(page);
    this.search.set("");
    if (page === "team")
      this.run(async () => this.team.set(await this.request("/team")));
  }
  chooseProject(id: string) {
    this.selectedProject.set(id);
    this.run(() => this.loadProject());
  }
  column(id: string) {
    return this.visible().filter((t) => t.status === id);
  }
  label(status: string) {
    return this.states.find((s) => s.id === status)?.label || status;
  }
  initials(name: string | undefined) {
    return (name || "?")
      .split(" ")
      .map((s) => s[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
  }
  date(value: string) {
    return new Date(value).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  }
  money(e: any) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: e.currency || "USD",
    }).format(
      e.items.reduce(
        (sum: number, i: any) =>
          sum + Math.round(i.quantity * i.rate * 100) / 100,
        0,
      ),
    );
  }
  toast(message: string) {
    this.notice.set(message);
    setTimeout(() => this.notice.set(""), 4500);
  }
  openProject() {
    this.projectForm = { name: "", client_name: "", description: "" };
    this.modal.set("project");
  }
  createProject() {
    this.run(async () => {
      const p = await this.request("/projects", "POST", this.projectForm);
      this.selectedProject.set(p.id);
      await this.refresh();
      this.modal.set("");
      this.page.set("board");
      this.toast("Project created");
    });
  }
  openTicketForm() {
    this.ticketForm = {
      title: "",
      description: "",
      acceptance_criteria: "",
      links: "",
      priority: "medium",
      assignee_id: "",
    };
    this.editing.set(false);
    this.modal.set("ticket");
  }
  openTicket(t: Ticket) {
    this.run(async () => {
      this.detail.set(await this.request(`/tickets/${t.id}`));
      this.comment = "";
      this.modal.set("detail");
    });
  }
  editTicket() {
    const t = this.detail()!;
    this.ticketForm = {
      title: t.title,
      description: t.description,
      acceptance_criteria: t.acceptance_criteria,
      links: t.links.join("\n"),
      priority: t.priority,
      assignee_id: t.assignee_id || "",
    };
    this.editing.set(true);
    this.modal.set("ticket");
  }
  saveTicket() {
    this.run(async () => {
      const body = {
        ...this.ticketForm,
        links: this.ticketForm.links
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        assignee_id: this.ticketForm.assignee_id || null,
      };
      await this.request(
        this.editing()
          ? `/tickets/${this.detail()!.id}`
          : `/projects/${this.selectedProject()}/tickets`,
        this.editing() ? "PATCH" : "POST",
        body,
      );
      await this.refresh();
      this.modal.set("");
      this.toast(this.editing() ? "Ticket updated" : "Ticket created");
    });
  }
  move(t: Ticket, status: string) {
    if (t.status === status || !this.canMove()) return;
    this.run(async () => {
      await this.request(`/tickets/${t.id}/status`, "PATCH", {
        status,
        expected_status: t.status,
      });
      await this.refresh();
      if (this.detail()?.id === t.id)
        this.detail.set(await this.request(`/tickets/${t.id}`));
      this.toast(`Moved to ${this.label(status)}`);
    });
  }
  drop(event: DragEvent, state: string) {
    event.preventDefault();
    const t = this.tickets().find((t) => t.id === this.dragging);
    if (t) this.move(t, state);
    this.dragging = "";
  }
  addComment() {
    if (!this.comment.trim()) return;
    this.run(async () => {
      await this.request(`/tickets/${this.detail()!.id}/comments`, "POST", {
        body: this.comment,
      });
      this.comment = "";
      this.detail.set(await this.request(`/tickets/${this.detail()!.id}`));
      await this.loadProject();
    });
  }
  upload(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > 5242880) {
      this.error.set("Choose a file up to 5 MB");
      input.value = "";
      return;
    }
    this.run(async () => {
      const data = new FormData();
      data.append("file", file);
      await this.request(`/tickets/${this.detail()!.id}/assets`, "POST", data);
      this.detail.set(await this.request(`/tickets/${this.detail()!.id}`));
      await this.loadProject();
      input.value = "";
    });
  }
  download(path: string, name: string) {
    this.run(async () => {
      const blob = await this.request(path, "GET", undefined, true);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }
  openEstimate() {
    this.estimateForm = {
      project_id: this.selectedProject(),
      title: "",
      client_email: "",
      currency: "USD",
      notes: "",
      items: [{ description: "", quantity: 1, rate: 0 }],
    };
    this.modal.set("estimate");
  }
  createEstimate() {
    this.run(async () => {
      await this.request("/estimates", "POST", this.estimateForm);
      await this.refresh();
      this.modal.set("");
      this.toast("Estimate created");
    });
  }
  sendEstimate(e: any) {
    this.run(async () => {
      await this.request(`/estimates/${e.id}/send`, "POST");
      await this.refresh();
      this.toast("Estimate sent");
    });
  }
  approveEstimate(e: any) {
    this.run(async () => {
      await this.request(`/estimates/${e.id}/approve`, "POST");
      await this.refresh();
      this.toast("Estimate approved");
    });
  }
  activate(p: Project) {
    this.run(async () => {
      await this.request(`/projects/${p.id}/status`, "PATCH", {
        status: "active",
      });
      await this.refresh();
      this.toast("Project activated");
    });
  }
  hasApproval(p: Project) {
    return this.estimates().some(
      (e) => e.project_id === p.id && e.status === "approved",
    );
  }
  openInvitation() {
    this.invitationForm = {
      name: "",
      email: "",
      role: "developer",
      title: "",
      project_ids: this.selectedProject() ? [this.selectedProject()] : [],
    };
    this.modal.set("invite");
  }
  toggleInviteProject(id: string, checked: boolean) {
    this.invitationForm.project_ids = checked
      ? [...this.invitationForm.project_ids, id]
      : this.invitationForm.project_ids.filter((p) => p !== id);
  }
  invite() {
    this.run(async () => {
      await this.request("/invitations", "POST", this.invitationForm);
      this.team.set(await this.request("/team"));
      this.modal.set("");
      this.toast("Invitation sent");
    });
  }
  addMember() {
    this.run(async () => {
      await this.request(
        `/projects/${this.selectedProject()}/members`,
        "POST",
        { user_id: this.memberId },
      );
      await this.loadProject();
      this.toast("Member added");
      this.modal.set("");
    });
  }
  openMembers() {
    this.run(async () => {
      this.team.set(await this.request("/team"));
      this.memberId = "";
      this.modal.set("members");
    });
  }
  @HostListener("document:keydown.escape") close() {
    if (!this.busy()) {
      this.modal.set("");
      this.previousFocus?.focus();
    }
  }
}
bootstrapApplication(App).catch(console.error);
