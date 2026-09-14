export type SessionWorkAssignmentContext = {
  engagementId: string;
  currentUserId: string;
  members: Array<{id: string; label: string; role: string}>;
};
