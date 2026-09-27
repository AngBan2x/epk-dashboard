// Unit tests for approvals split architecture
// Tests API contracts with vitest mocking

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock modules using vi.fn()
vi.mock("@/lib/db", () => ({
  getTrackSubmissionsByUser: vi.fn(),
  createTrackSubmission: vi.fn(),
  getTrackSubmissionById: vi.fn(),
  getAllTrackSubmissions: vi.fn(),
  getTrackSubmissionsByStatus: vi.fn(),
  updateTrackSubmissionStatus: vi.fn(),
  getUserById: vi.fn(),
  getAllUsers: vi.fn(),
  getArtistByUserId: vi.fn(),
  isTursoEnabled: vi.fn(() => false),
  tursoExecUpdate: vi.fn(),
  getLocalDbWrite: vi.fn(() => ({
    prepare: vi.fn(() => ({ run: vi.fn() })),
  })),
}));

vi.mock("@/lib/auth", () => ({
  validateRequest: vi.fn(),
}));

vi.mock("@/lib/approval-notifications", () => ({
  notifyApprovalDecision: vi.fn(),
}));

vi.mock("@/lib/artist-promotion", () => ({
  promoteUserToArtist: vi.fn(),
}));

import { GET as submissionsGET, POST as submissionsPOST } from "@/app/api/submissions/route";
import { GET as approvalsGET } from "@/app/api/admin/approvals/route";
import { POST as approvalActionPOST } from "@/app/api/admin/approvals/[id]/route";
import { PATCH as userRolePATCH } from "@/app/api/admin/users/[id]/role/route";
import { validateRequest } from "@/lib/auth";
import { getTrackSubmissionsByUser, createTrackSubmission, getTrackSubmissionById, updateTrackSubmissionStatus, getAllTrackSubmissions, getUserById, getAllUsers } from "@/lib/db";
import { notifyApprovalDecision } from "@/lib/approval-notifications";
import { promoteUserToArtist } from "@/lib/artist-promotion";

const mockValidateRequest = validateRequest as ReturnType<typeof vi.fn>;
const mockGetTrackSubmissionsByUser = getTrackSubmissionsByUser as ReturnType<typeof vi.fn>;
const mockCreateTrackSubmission = createTrackSubmission as ReturnType<typeof vi.fn>;
const mockGetTrackSubmissionById = getTrackSubmissionById as ReturnType<typeof vi.fn>;
const mockGetAllTrackSubmissions = getAllTrackSubmissions as ReturnType<typeof vi.fn>;
const mockUpdateTrackSubmissionStatus = updateTrackSubmissionStatus as ReturnType<typeof vi.fn>;
const mockNotifyApprovalDecision = notifyApprovalDecision as ReturnType<typeof vi.fn>;
const mockPromoteUserToArtist = promoteUserToArtist as ReturnType<typeof vi.fn>;
const mockGetUserById = getUserById as ReturnType<typeof vi.fn>;
const mockGetAllUsers = getAllUsers as ReturnType<typeof vi.fn>;

function createMockRequest(url: string, options: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) {
  return new NextRequest(url, {
    method: options.method || "GET",
    body: options.body ? JSON.stringify(options.body) : undefined,
    headers: options.headers || { "Content-Type": "application/json" },
  });
}

describe("Approvals Split - API Contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/submissions (Artist Portal)", () => {
    it("rejects unauthenticated requests with 401", async () => {
      mockValidateRequest.mockResolvedValue(null);

      const req = createMockRequest("http://localhost/api/submissions");
      const res = await submissionsGET(req);

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBe("No autenticado");
    });

    it("returns only own submissions for artist with Spanish status labels", async () => {
      const session = { userId: "user-1", role: "artist" };
      mockValidateRequest.mockResolvedValue(session);

      const submissions = [
        { id: "sub-1", user_id: "user-1", track_data: '{"title":"Track 1"}', status: "pending", admin_notes: null, submission_type: "track", metadata: null, admin_id: null, reviewed_at: null, created_at: "2026-01-01", updated_at: "2026-01-01" },
        { id: "sub-2", user_id: "user-1", track_data: '{"title":"Track 2"}', status: "approved", admin_notes: null, submission_type: "track", metadata: null, admin_id: null, reviewed_at: null, created_at: "2026-01-02", updated_at: "2026-01-02" },
      ];
      mockGetTrackSubmissionsByUser.mockResolvedValue(submissions);

      const req = createMockRequest("http://localhost/api/submissions");
      const res = await submissionsGET(req);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toHaveLength(2);
      expect(json.every((s: any) => s.user_id === "user-1")).toBe(true);
      expect(json[0]).toHaveProperty("status_label");
      expect(json[0].status_label).toBe("Pendiente");
      expect(json[1].status_label).toBe("Aprobado");
    });

    it("filters by status when provided", async () => {
      const session = { userId: "user-1", role: "artist" };
      mockValidateRequest.mockResolvedValue(session);

      const submissions = [
        { id: "sub-1", user_id: "user-1", track_data: '{"title":"Track 1"}', status: "pending", admin_notes: null, submission_type: "track", metadata: null, admin_id: null, reviewed_at: null, created_at: "2026-01-01", updated_at: "2026-01-01" },
      ];
      mockGetTrackSubmissionsByUser.mockResolvedValue(submissions);

      const req = createMockRequest("http://localhost/api/submissions?status=pending");
      const res = await submissionsGET(req);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toHaveLength(1);
      expect(json[0].status).toBe("pending");
    });

    it("includes revision status in response", async () => {
      const session = { userId: "user-1", role: "artist" };
      mockValidateRequest.mockResolvedValue(session);

      const submissions = [
        { id: "sub-1", user_id: "user-1", track_data: '{"title":"Track 1"}', status: "revision", admin_notes: "Fix the cover", submission_type: "track", metadata: null, admin_id: "admin-1", reviewed_at: "2026-01-01", created_at: "2026-01-01", updated_at: "2026-01-01" },
      ];
      mockGetTrackSubmissionsByUser.mockResolvedValue(submissions);

      const req = createMockRequest("http://localhost/api/submissions");
      const res = await submissionsGET(req);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json[0].status).toBe("revision");
      expect(json[0].status_label).toBe("Revisión");
    });
  });

  describe("POST /api/submissions (Artist Portal - Create)", () => {
    it("rejects unauthenticated requests with 401", async () => {
      mockValidateRequest.mockResolvedValue(null);

      const req = createMockRequest("http://localhost/api/submissions", {
        method: "POST",
        body: { track_data: { title: "Test", artist_name: "Artist", release_type: "Single", release_date: "2026-01-01", duration: "3:00", cover_image: "https://example.com/cover.jpg", audio_preview_url: "https://example.com/preview.mp3" } },
      });
      const res = await submissionsPOST(req);

      expect(res.status).toBe(401);
    });

    it("creates submission with pending status for authenticated artist", async () => {
      const session = { userId: "user-1", role: "artist" };
      mockValidateRequest.mockResolvedValue(session);

      const createdSubmission = {
        id: "new-sub-1",
        user_id: "user-1",
        track_data: '{"title":"Test"}',
        status: "pending",
        admin_notes: null,
        submission_type: "track",
        metadata: null,
        admin_id: null,
        reviewed_at: null,
        created_at: "2026-01-01",
        updated_at: "2026-01-01",
      };
      mockCreateTrackSubmission.mockResolvedValue(createdSubmission);

      const req = createMockRequest("http://localhost/api/submissions", {
        method: "POST",
        body: {
          track_data: {
            title: "Test",
            artist_name: "Artist",
            release_type: "Single",
            release_date: "2026-01-01",
            duration: "3:00",
            cover_image: "https://example.com/cover.jpg",
            audio_preview_url: "https://example.com/preview.mp3",
          },
        },
      });
      const res = await submissionsPOST(req);

      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.status).toBe("pending");
      expect(json.status_label).toBe("Pendiente");
    });

    it("validates required fields", async () => {
      const session = { userId: "user-1", role: "artist" };
      mockValidateRequest.mockResolvedValue(session);

      const req = createMockRequest("http://localhost/api/submissions", {
        method: "POST",
        body: { track_data: { title: "" } },
      });
      const res = await submissionsPOST(req);

      expect(res.status).toBe(400);
    });
  });

  describe("POST /api/admin/approvals/[id] (Admin Decisions - Single Writer)", () => {
    it("rejects non-admin with 401", async () => {
      mockValidateRequest.mockResolvedValue({ userId: "user-1", role: "artist" });

      const req = createMockRequest("http://localhost/api/admin/approvals/sub-1", {
        method: "POST",
        body: { action: "approve", reason: "Looks good" },
      });
      const res = await approvalActionPOST(req, { params: { id: "sub-1" } });

      expect(res.status).toBe(401);
    });

    it("rejects rejection reason with less than 10 chars (backend validation)", async () => {
      mockValidateRequest.mockResolvedValue({ userId: "admin-1", role: "admin" });

      const req = createMockRequest("http://localhost/api/admin/approvals/sub-1", {
        method: "POST",
        body: { action: "reject", reason: "Short" },
      });
      const res = await approvalActionPOST(req, { params: { id: "sub-1" } });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBeDefined();
    });

    it("approves submission and returns promoted:true when promotion succeeds", async () => {
      mockValidateRequest.mockResolvedValue({ userId: "admin-1", role: "admin" });

      const submission = {
        id: "sub-1",
        user_id: "user-subscriber",
        track_data: '{"title":"My Track","artist_name":"Test Artist"}',
        status: "pending",
        admin_notes: null,
        submission_type: "track",
        metadata: null,
        admin_id: null,
        reviewed_at: null,
        created_at: "2026-01-01",
        updated_at: "2026-01-01",
      };
      mockGetTrackSubmissionById.mockResolvedValue(submission);

      const updatedSubmission = {
        ...submission,
        status: "approved",
        admin_notes: "Approved",
        admin_id: "admin-1",
        reviewed_at: "2026-01-01T12:00:00Z",
        updated_at: "2026-01-01T12:00:00Z",
      };
      mockUpdateTrackSubmissionStatus.mockResolvedValue(updatedSubmission);
      mockNotifyApprovalDecision.mockResolvedValue({ notificationCreated: true, emailSent: false });
      mockPromoteUserToArtist.mockResolvedValue({ promoted: true, artistId: "artist-1", created: true });

      const req = createMockRequest("http://localhost/api/admin/approvals/sub-1", {
        method: "POST",
        body: { action: "approve", reason: "Great track!" },
      });
      const res = await approvalActionPOST(req, { params: { id: "sub-1" } });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status).toBe("approved");
      expect(json.promoted).toBe(true);
      expect(mockPromoteUserToArtist).toHaveBeenCalledWith("user-subscriber", { source: "release" });
    });

    it("approves submission but promoted:false when promotion fails (does not break approval)", async () => {
      mockValidateRequest.mockResolvedValue({ userId: "admin-1", role: "admin" });

      const submission = {
        id: "sub-1",
        user_id: "user-subscriber",
        track_data: '{"title":"My Track","artist_name":"Test Artist"}',
        status: "pending",
        admin_notes: null,
        submission_type: "track",
        metadata: null,
        admin_id: null,
        reviewed_at: null,
        created_at: "2026-01-01",
        updated_at: "2026-01-01",
      };
      mockGetTrackSubmissionById.mockResolvedValue(submission);

      const updatedSubmission = {
        ...submission,
        status: "approved",
        admin_notes: "Approved",
        admin_id: "admin-1",
        reviewed_at: "2026-01-01T12:00:00Z",
        updated_at: "2026-01-01T12:00:00Z",
      };
      mockUpdateTrackSubmissionStatus.mockResolvedValue(updatedSubmission);
      mockNotifyApprovalDecision.mockResolvedValue({ notificationCreated: true, emailSent: false });
      mockPromoteUserToArtist.mockRejectedValue(new Error("Promotion failed"));

      const req = createMockRequest("http://localhost/api/admin/approvals/sub-1", {
        method: "POST",
        body: { action: "approve", reason: "Great track!" },
      });
      const res = await approvalActionPOST(req, { params: { id: "sub-1" } });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status).toBe("approved");
      expect(json.promoted).toBe(false);
    });

    it("rejects submission with valid reason (>= 10 chars)", async () => {
      mockValidateRequest.mockResolvedValue({ userId: "admin-1", role: "admin" });

      const submission = {
        id: "sub-1",
        user_id: "user-1",
        track_data: '{"title":"My Track","artist_name":"Test Artist"}',
        status: "pending",
        admin_notes: null,
        submission_type: "track",
        metadata: null,
        admin_id: null,
        reviewed_at: null,
        created_at: "2026-01-01",
        updated_at: "2026-01-01",
      };
      mockGetTrackSubmissionById.mockResolvedValue(submission);

      const updatedSubmission = {
        ...submission,
        status: "rejected",
        admin_notes: "Valid rejection reason here",
        admin_id: "admin-1",
        reviewed_at: "2026-01-01T12:00:00Z",
        updated_at: "2026-01-01T12:00:00Z",
      };
      mockUpdateTrackSubmissionStatus.mockResolvedValue(updatedSubmission);
      mockNotifyApprovalDecision.mockResolvedValue({ notificationCreated: true, emailSent: false });

      const req = createMockRequest("http://localhost/api/admin/approvals/sub-1", {
        method: "POST",
        body: { action: "reject", reason: "Valid rejection reason here" },
      });
      const res = await approvalActionPOST(req, { params: { id: "sub-1" } });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status).toBe("rejected");
      expect(json.admin_notes).toBe("Valid rejection reason here");
    });

    it("requests revision with valid reason (>= 10 chars)", async () => {
      mockValidateRequest.mockResolvedValue({ userId: "admin-1", role: "admin" });

      const submission = {
        id: "sub-1",
        user_id: "user-1",
        track_data: '{"title":"My Track","artist_name":"Test Artist"}',
        status: "pending",
        admin_notes: null,
        submission_type: "track",
        metadata: null,
        admin_id: null,
        reviewed_at: null,
        created_at: "2026-01-01",
        updated_at: "2026-01-01",
      };
      mockGetTrackSubmissionById.mockResolvedValue(submission);

      const updatedSubmission = {
        ...submission,
        status: "revision",
        admin_notes: "Please fix the cover art",
        admin_id: "admin-1",
        reviewed_at: "2026-01-01T12:00:00Z",
        updated_at: "2026-01-01T12:00:00Z",
        revision: 1,
      };
      mockUpdateTrackSubmissionStatus.mockResolvedValue(updatedSubmission);
      mockNotifyApprovalDecision.mockResolvedValue({ notificationCreated: true, emailSent: false });

      const req = createMockRequest("http://localhost/api/admin/approvals/sub-1", {
        method: "POST",
        body: { action: "revision", reason: "Please fix the cover art" },
      });
      const res = await approvalActionPOST(req, { params: { id: "sub-1" } });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status).toBe("revision");
      expect(json.admin_notes).toBe("Please fix the cover art");
    });
  });

  describe("PATCH /api/admin/users/[id]/role (Admin Role Management)", () => {
    it("rejects non-admin with 403", async () => {
      mockValidateRequest.mockResolvedValue({ userId: "user-1", role: "artist" });

      const req = createMockRequest("http://localhost/api/admin/users/user-2/role", {
        method: "PATCH",
        body: { role: "admin" },
      });
      const res = await userRolePATCH(req, { params: { id: "user-2" } });

      expect(res.status).toBe(403);
    });

    it("rejects invalid role", async () => {
      mockValidateRequest.mockResolvedValue({ userId: "admin-1", role: "admin" });

      const req = createMockRequest("http://localhost/api/admin/users/user-2/role", {
        method: "PATCH",
        body: { role: "invalid" },
      });
      const res = await userRolePATCH(req, { params: { id: "user-2" } });

      expect(res.status).toBe(400);
    });

    it("prevents demoting the last admin", async () => {
      mockValidateRequest.mockResolvedValue({ userId: "admin-1", role: "admin" });
      mockGetUserById.mockResolvedValue({ id: "user-2", role: "admin", name: "User 2" });
      mockGetAllUsers.mockResolvedValue([
        { id: "admin-1", role: "admin" },
      ]);

      const req = createMockRequest("http://localhost/api/admin/users/user-2/role", {
        method: "PATCH",
        body: { role: "artist" },
      });
      const res = await userRolePATCH(req, { params: { id: "user-2" } });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("último administrador");
    });

    it("allows role change and returns reauthRequired: true", async () => {
      mockValidateRequest.mockResolvedValue({ userId: "admin-1", role: "admin" });
      mockGetUserById
        .mockResolvedValueOnce({ id: "user-2", role: "subscriber", name: "User 2" })
        .mockResolvedValueOnce({ id: "user-2", role: "artist", name: "User 2" });
      mockGetAllUsers.mockResolvedValue([
        { id: "admin-1", role: "admin" },
        { id: "user-2", role: "subscriber" },
      ]);

      const req = createMockRequest("http://localhost/api/admin/users/user-2/role", {
        method: "PATCH",
        body: { role: "artist" },
      });
      const res = await userRolePATCH(req, { params: { id: "user-2" } });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.user.role).toBe("artist");
      expect(json.reauthRequired).toBe(true);
      expect(json.message).toContain("volver a iniciar sesión");
    });

    it("is idempotent when role is already the same", async () => {
      mockValidateRequest.mockResolvedValue({ userId: "admin-1", role: "admin" });
      mockGetUserById.mockResolvedValue({ id: "user-2", role: "artist", name: "User 2" });

      const req = createMockRequest("http://localhost/api/admin/users/user-2/role", {
        method: "PATCH",
        body: { role: "artist" },
      });
      const res = await userRolePATCH(req, { params: { id: "user-2" } });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.message).toBe("El rol ya era el solicitado");
      expect(json.reauthRequired).toBe(true);
    });
  });
});