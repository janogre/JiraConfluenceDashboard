// Jira Types
export interface JiraProject {
  id: string;
  key: string;
  name: string;
  description?: string;
  lead?: {
    displayName: string;
    avatarUrl?: string;
  };
  avatarUrl?: string;
}

export interface JiraIssueLink {
  id: string;
  type: {
    name: string;
    inward: string;
    outward: string;
  };
  inwardIssue?: {
    key: string;
    summary: string;
    status: { name: string; category: 'new' | 'indeterminate' | 'done' };
    issueType: { name: string; iconUrl?: string };
  };
  outwardIssue?: {
    key: string;
    summary: string;
    status: { name: string; category: 'new' | 'indeterminate' | 'done' };
    issueType: { name: string; iconUrl?: string };
  };
}

export interface JiraSubtask {
  id: string;
  key: string;
  summary: string;
  status: {
    name: string;
    category: 'new' | 'indeterminate' | 'done';
  };
  issueType: {
    name: string;
    iconUrl?: string;
  };
}

export interface JiraIssue {
  id: string;
  key: string;
  summary: string;
  description?: string;
  status: {
    id: string;
    name: string;
    category: 'new' | 'indeterminate' | 'done';
  };
  priority?: {
    id: string;
    name: string;
    iconUrl?: string;
  };
  assignee?: {
    displayName: string;
    avatarUrl?: string;
  };
  reporter?: {
    displayName: string;
    avatarUrl?: string;
  };
  projectKey: string;
  issueType: {
    id: string;
    name: string;
    iconUrl?: string;
  };
  created: string;
  updated: string;
  dueDate?: string;
  startDate?: string;
  resolutionDate?: string;
  labels: string[];
  kategori?: string;
  components: { id: string; name: string }[];
  subtasks?: JiraSubtask[];
  links?: JiraIssueLink[];
  parent?: {
    key: string;
    summary: string;
    issueType?: { name: string; iconUrl?: string };
  };
}

export interface JiraStatus {
  id: string;
  name: string;
  category: 'new' | 'indeterminate' | 'done';
}

export interface JiraComment {
  id: string;
  body: string;
  author: {
    displayName: string;
    avatarUrl?: string;
  };
  created: string;
  updated: string;
}

export interface JiraWorklog {
  id: string;
  author: {
    displayName: string;
    avatarUrl?: string;
  };
  comment?: string;
  started: string;
  timeSpent: string;
  timeSpentSeconds: number;
}

export interface JiraFilter {
  id: string;
  name: string;
  description?: string;
  jql: string;
  owner: {
    displayName: string;
    avatarUrl?: string;
  };
  favourite: boolean;
}

export interface JiraUser {
  accountId: string;
  displayName: string;
  emailAddress?: string;
  avatarUrl?: string;
  active: boolean;
}

// Confluence Types
export interface ConfluencePage {
  id: string;
  title: string;
  spaceKey: string;
  spaceName?: string;
  url: string;
  lastModified: string;
  lastModifiedBy?: {
    id?: string;
    displayName: string;
    avatarUrl?: string;
  };
  excerpt?: string;
  linkedIssues?: string[]; // Jira issue keys linked to this page
  hasChildren?: boolean;
  type?: 'page' | 'blogpost' | 'folder';
}

export interface ConfluenceSpace {
  id: string;
  key: string;
  name: string;
  description?: string;
  url: string;
}

export interface ConfluenceTask {
  globalId: number;
  id: number;
  pageId: string;
  pageTitle: string;
  pageUrl: string;
  spaceKey: string;
  body: string;
  status: 'complete' | 'incomplete';
  createdDate: number;
  dueDate?: number;
  creator?: { displayName: string; accountId?: string };
  assignee?: { displayName: string; accountId?: string };
}

export interface ConfluenceTemplate {
  templateId: string;
  name: string;
  description?: string;
  body?: string; // storage-format HTML
}

// Private Todo Types
export interface TodoSubtask {
  id: string;
  content: string;
  completed: boolean;
}

export interface LinkedConfluenceTask {
  globalId: number;
  body: string;
  pageTitle: string;
  pageUrl: string;
}

export interface TodoItem {
  id: string;
  content: string;
  completed: boolean;
  linkedJiraIssue?: string; // Jira issue key
  linkedConfluenceTask?: LinkedConfluenceTask;
  priority: 'low' | 'medium' | 'high';
  dueDate?: string;
  notes?: string;
  tags?: string[];
  subtasks?: TodoSubtask[];
  createdAt: string;
  updatedAt: string;
}

export interface JiraSprint {
  id: number;
  name: string;
  state: 'active' | 'closed' | 'future';
  startDate?: string;
  endDate?: string;
  goal?: string;
}

// Calendar Types
export type AbsenceType = 'ferie' | 'syk' | 'avspasering' | 'annet';

export interface AbsenceEntry {
  id: string;
  personAccountId: string;
  personName: string;
  startDate: string;
  endDate: string;
  type: AbsenceType;
  note?: string;
}

export interface ExternalPortal {
  id: string;
  title: string;
  url: string;
  description?: string;
  createdAt: string;
}

// API Configuration
export interface ApiConfig {
  jiraBaseUrl: string;
  confluenceBaseUrl: string;
  email: string;
  apiToken: string;
  anthropicApiKey?: string;
}

// Business Central – Lager
export interface BcItemOpenOrder {
  orderNumber: string;
  outstandingQuantity: number;
  vendorName: string;
  locationCode: string;
  expectedReceiptDate: string;
  orderDate: string;
}

export interface BcItem {
  number: string;
  displayName: string;
  displayName2: string | null;
  inventory: number;
  inventoryPostingGroupCode: string;
  lastModifiedDateTime: string;
  inventoryByLocation: Record<string, number>;
  openOrders: BcItemOpenOrder[];
  consumption: BcItemConsumption;
}

export type BcItemLedgerEntryType =
  | 'Purchase' | 'Sale' | 'Positive Adjmt.' | 'Negative Adjmt.'
  | 'Transfer' | 'Consumption' | 'Output';

export interface BcItemLedgerEntry {
  entryNo: number;
  itemNumber: string;
  postingDate: string;
  entryType: BcItemLedgerEntryType | string;
  documentNumber: string;
  documentType: string;
  locationCode: string;
  quantity: number;
  remainingQuantity: number;
  description: string;
  unitOfMeasureCode: string;
}

export interface BcItemConsumption {
  last30d: number;
  last90d: number;
  lastMovementDate: string | null;
}

export interface BcItemLedgerEntriesResponse {
  entries: BcItemLedgerEntry[];
  fetchedAt: string;
}

export interface BcItemsResponse {
  items: BcItem[];
  fetchedAt: string;
}

export interface BcLocation {
  id: string;
  code: string;
  displayName: string;
}

export interface BcLocationsResponse {
  locations: BcLocation[];
  neasLocationCodes: string[];
  fetchedAt: string;
}

export interface BcPurchaseOrderLine {
  lineObjectNumber: string;
  description: string;
  quantity: number;
  receivedQuantity: number;
  invoicedQuantity: number;
  expectedReceiptDate: string;
  locationId: string;
  unitOfMeasureCode: string;
  locationCode: string; // beriket server-side; 'UKJENT' hvis locationId ikke finnes i cache
}

export interface BcPurchaseOrder {
  id: string;
  number: string;
  orderDate: string;
  vendorNumber: string;
  vendorName: string;
  derivedStatus: 'Bestilt' | 'Delvis mottatt' | 'Mottatt' | 'Ufullstendig';
  shipToName: string;
  purchaser: string;
  fullyReceived: boolean;
  lastModifiedDateTime: string;
  purchaseOrderLines: BcPurchaseOrderLine[];
}

export interface BcPurchaseOrdersResponse {
  orders: BcPurchaseOrder[];
  fetchedAt: string;
}
