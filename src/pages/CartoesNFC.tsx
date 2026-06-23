import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Nfc, Plus, ExternalLink, QrCode, Trash2, Search, CreditCard, Users, Link2, Activity, Palette } from "lucide-react";
import { useNfcCards, useNfcDashboard, useDeleteNfcCard, NfcCard } from "@/hooks/use-nfc";
import { NfcCardDialog } from "@/components/nfc/NfcCardDialog";
import { NfcBrandingDialog } from "@/components/nfc/NfcBrandingDialog";
import { toast } from "sonner";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

export default function CartoesNFC() {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<NfcCard | null>(null);
  const [search, setSearch] = useState("");
  const { data: dash } = useNfcDashboard();
  const { data: cards = [], isLoading } = useNfcCards({ search });
  const del = useDeleteNfcCard();

  const stats = dash?.stats || {};
  const reads = stats.reads || {};

  async function handleDelete(id: string) {
    if (!confirm("Excluir este cartão?")) return;
    await del.mutateAsync(id);
    toast.success("Cartão excluído");
  }

  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Nfc className="h-6 w-6 text-primary" /> Cartões NFC
            </h1>
            <p className="text-muted-foreground">Gerencie cartões NFC físicos vinculados aos seus vendedores.</p>
          </div>
          <Button onClick={() => { setEditing(null); setOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" /> Novo Cartão
          </Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard icon={<CreditCard />} label="Ativos" value={stats.active || 0} />
          <StatCard icon={<CreditCard />} label="Inativos" value={stats.inactive || 0} />
          <StatCard icon={<Link2 />} label="Vinculados" value={stats.linked || 0} />
          <StatCard icon={<Users />} label="Não Vinculados" value={stats.unlinked || 0} />
          <StatCard icon={<Activity />} label="Leituras Totais" value={reads.total || 0} accent />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle>Leituras nos últimos 30 dias</CardTitle></CardHeader>
            <CardContent style={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dash?.series || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="day" />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="reads" stroke="hsl(var(--primary))" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Top Vendedores</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {(dash?.top || []).map((t: any) => (
                  <div key={t.user_id || t.name} className="flex justify-between text-sm">
                    <span>{t.name || "—"}</span>
                    <Badge variant="secondary">{t.reads}</Badge>
                  </div>
                ))}
                {(!dash?.top || dash.top.length === 0) && (
                  <p className="text-sm text-muted-foreground">Sem leituras ainda.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Cartões</CardTitle>
              <div className="relative w-64">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input className="pl-8" placeholder="Buscar UID, slug ou usuário" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>UID</TableHead>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Leituras</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cards.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono text-xs">{c.uid}</TableCell>
                    <TableCell>{c.user_name || "—"}</TableCell>
                    <TableCell>{c.company_name || "—"}</TableCell>
                    <TableCell><code>{c.public_slug}</code></TableCell>
                    <TableCell>{c.reads_count || 0}</TableCell>
                    <TableCell>
                      <Badge variant={c.status === "active" ? "default" : "secondary"}>{c.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="icon" variant="ghost" onClick={() => window.open(c.public_url, "_blank")}><ExternalLink className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => window.open(c.qr_code_url, "_blank")}><QrCode className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => { setEditing(c); setOpen(true); }}><Nfc className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => handleDelete(c.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!isLoading && cards.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhum cartão cadastrado.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <NfcCardDialog open={open} onOpenChange={setOpen} card={editing} />
    </MainLayout>
  );
}

function StatCard({ icon, label, value, accent }: any) {
  return (
    <Card className={accent ? "border-primary/40" : ""}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground text-xs">{icon}<span>{label}</span></div>
        <div className="text-2xl font-bold mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}
