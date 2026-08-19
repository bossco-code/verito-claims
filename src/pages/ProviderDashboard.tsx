import { useCallback, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowRight,
  ChevronLeft,
  FileUp,
  Loader2,
  Plus,
  Trash2,
  Users,
} from "lucide-react";

const MARKETPLACE_OPTIONS = [
  { value: "ATVPDKIKX0DER", label: "Amazon.com (US)" },
  { value: "A1PA6795UKMFR9", label: "Amazon.de (DE)" },
  { value: "A1VC38T7YXB528", label: "Amazon.co.jp (JP)" },
  { value: "A2EUQ1WTGCTBG2", label: "Amazon.ca (CA)" },
  { value: "A1F83G8C2ARO7P", label: "Amazon.co.uk (UK)" },
];

const REGION_OPTIONS = [
  { value: "NA", label: "North America" },
  { value: "EU", label: "Europe" },
  { value: "FE", label: "Far East" },
];

type View = "list" | "client";

export default function ProviderDashboard() {
  const [view, setView] = useState<View>("list");
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const clients = useQuery(api.amazon.providerMode.listClients);
  const clientDetail = useQuery(
    api.amazon.providerMode.getClientDetail,
    selectedClientId ? { clientId: selectedClientId as any } : "skip",
  );
  const createClient = useMutation(api.amazon.providerMode.createClient);
  const deleteClient = useMutation(api.amazon.providerMode.deleteClient);
  const ingestCsv = useMutation(api.amazon.providerMode.ingestCsv);

  const [newClient, setNewClient] = useState({
    clientName: "",
    sellerId: "",
    marketplaceId: "ATVPDKIKX0DER",
    region: "NA",
    notes: "",
  });

  const handleCreateClient = useCallback(async () => {
    if (!newClient.clientName.trim()) {
      toast.error("Client name is required");
      return;
    }
    try {
      await createClient({
        clientName: newClient.clientName.trim(),
        sellerId: newClient.sellerId.trim() || undefined,
        marketplaceId: newClient.marketplaceId,
        region: newClient.region,
        notes: newClient.notes.trim() || undefined,
      });
      toast.success("Client created");
      setCreateOpen(false);
      setNewClient({
        clientName: "",
        sellerId: "",
        marketplaceId: "ATVPDKIKX0DER",
        region: "NA",
        notes: "",
      });
    } catch {
      toast.error("Failed to create client");
    }
  }, [newClient, createClient]);

  const handleDeleteClient = useCallback(
    async (clientId: string) => {
      try {
        await deleteClient({ clientId: clientId as any });
        toast.success("Client deleted");
        setView("list");
        setSelectedClientId(null);
      } catch {
        toast.error("Failed to delete client");
      }
    },
    [deleteClient],
  );

  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !selectedClientId) return;

      setUploading(true);
      try {
        const text = await file.text();
        const name = file.name.toLowerCase();
        let reportType: "financial_events" | "inventory" | "settlement" =
          "financial_events";
        if (name.includes("inventory") || name.includes("adjustment")) {
          reportType = "inventory";
        } else if (name.includes("settlement")) {
          reportType = "settlement";
        }

        const result = await ingestCsv({
          clientId: selectedClientId as any,
          csvText: text,
          fileName: file.name,
          marketplaceId:
            clientDetail?.client.marketplaceId ?? "ATVPDKIKX0DER",
          reportType,
        });

        if (result.ok) {
          toast.success(
            `Analyzed ${result.eventsStored} events → ${result.candidatesCreated} candidates found`,
          );
        } else {
          toast.error("Analysis failed");
        }
      } catch {
        toast.error("Failed to upload CSV");
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [selectedClientId, clientDetail, ingestCsv],
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60 bg-card/50 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            {view === "client" && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setView("list");
                  setSelectedClientId(null);
                }}
                className="mr-1"
              >
                <ChevronLeft className="size-4" />
              </Button>
            )}
            <h1 className="text-lg font-semibold tracking-tight">
              {view === "list"
                ? "Provider Dashboard"
                : clientDetail?.client.clientName ?? "Client"}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {view === "list" && (
              <Button
                size="sm"
                onClick={() => setCreateOpen(true)}
                className="rounded-xl"
              >
                <Plus className="size-4 mr-1" />
                New Client
              </Button>
            )}
            {view === "client" && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.tsv,.txt"
                  className="hidden"
                  onChange={handleFileUpload}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="rounded-xl"
                >
                  {uploading ? (
                    <Loader2 className="size-4 mr-1 animate-spin" />
                  ) : (
                    <FileUp className="size-4 mr-1" />
                  )}
                  Upload CSV
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
        {view === "list" && (
          <>
            {clients === undefined ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
              </div>
            ) : clients.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <Users className="size-12 text-muted-foreground/40 mb-4" />
                <h2 className="text-lg font-semibold tracking-tight">
                  No clients yet
                </h2>
                <p className="mt-2 text-sm text-muted-foreground max-w-md">
                  Create your first client to start uploading Amazon CSV
                  reports and running reimbursement analysis.
                </p>
                <Button
                  onClick={() => setCreateOpen(true)}
                  className="mt-6 rounded-xl"
                >
                  <Plus className="size-4 mr-2" />
                  Create Client
                </Button>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {clients.map((client: any) => (
                  <button
                    key={client._id}
                    type="button"
                    onClick={() => {
                      setSelectedClientId(client._id);
                      setView("client");
                    }}
                    className="group flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-border/80 bg-card p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-teal/50"
                  >
                    <div className="min-w-0">
                      <p className="font-mono text-[11.5px] font-semibold tracking-[0.04em] text-foreground truncate">
                        {client.clientName}
                      </p>
                      <p className="mt-0.5 text-[12px] text-muted-foreground">
                        {client.candidateCount} candidates ·{" "}
                        {client.uploadCount} uploads
                      </p>
                      <p className="mt-1 font-mono text-[10.5px] uppercase tracking-[0.08em] text-teal-deep">
                        {client.status}
                      </p>
                    </div>
                    <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-teal" />
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {view === "client" && clientDetail && (
          <div>
            <div className="rounded-2xl border border-border/80 bg-card p-5">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="font-semibold tracking-tight">
                    {clientDetail.client.clientName}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Marketplace: {clientDetail.client.marketplaceId} · Region:{" "}
                    {clientDetail.client.region}
                  </p>
                  {clientDetail.client.sellerId && (
                    <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                      Seller ID: {clientDetail.client.sellerId}
                    </p>
                  )}
                  {clientDetail.client.notes && (
                    <p className="mt-2 text-sm text-muted-foreground">
                      {clientDetail.client.notes}
                    </p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    handleDeleteClient(clientDetail.client._id)
                  }
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>

            <div className="mt-6">
              <h3 className="font-semibold tracking-tight mb-3">
                Upload History
              </h3>
              {clientDetail.uploads.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No CSV uploads yet. Click "Upload CSV" to get started.
                </p>
              ) : (
                <div className="space-y-2">
                  {clientDetail.uploads.map((upload: any) => (
                    <div
                      key={upload._id}
                      className="flex items-center justify-between rounded-xl border border-border/60 bg-card/50 p-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {upload.fileName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {upload.parsedCount} records parsed ·{" "}
                          {upload.reportType} ·{" "}
                          {new Date(upload.uploadedAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-6">
              <h3 className="font-semibold tracking-tight mb-3">
                Found Candidates ({clientDetail.candidates.length})
              </h3>
              {clientDetail.candidates.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No candidates found yet. Upload CSV reports to run analysis.
                </p>
              ) : (
                <div className="space-y-2">
                  {clientDetail.candidates.map((c: any) => (
                    <div
                      key={c._id}
                      className="flex items-center justify-between rounded-xl border border-border/60 bg-card/50 p-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          {c.claimId} · {c.candidate_type}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          SKU: {c.sku ?? "—"} · Qty: {c.quantity ?? "—"} ·{" "}
                          Est: ${c.estimated_value ?? 0}
                        </p>
                      </div>
                      <span className="font-mono text-[10px] uppercase tracking-wider text-teal-deep">
                        {c.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Client</DialogTitle>
            <DialogDescription>
              Add a seller client to manage their reimbursement analysis.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <Label>Client Name *</Label>
              <Input
                placeholder="e.g. Smith Electronics LLC"
                value={newClient.clientName}
                onChange={(e) =>
                  setNewClient((p) => ({ ...p, clientName: e.target.value }))
                }
                className="mt-1"
              />
            </div>
            <div>
              <Label>Seller ID (optional)</Label>
              <Input
                placeholder="Amazon marketplace seller ID"
                value={newClient.sellerId}
                onChange={(e) =>
                  setNewClient((p) => ({ ...p, sellerId: e.target.value }))
                }
                className="mt-1"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Marketplace</Label>
                <Select
                  value={newClient.marketplaceId}
                  onValueChange={(v) =>
                    setNewClient((p) => ({ ...p, marketplaceId: v }))
                  }
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MARKETPLACE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Region</Label>
                <Select
                  value={newClient.region}
                  onValueChange={(v) =>
                    setNewClient((p) => ({ ...p, region: v }))
                  }
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REGION_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <Textarea
                placeholder="Any notes about this client..."
                value={newClient.notes}
                onChange={(e) =>
                  setNewClient((p) => ({ ...p, notes: e.target.value }))
                }
                className="mt-1"
                rows={2}
              />
            </div>
            <Button onClick={handleCreateClient} className="w-full rounded-xl">
              Create Client
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
