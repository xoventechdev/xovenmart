"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Ban,
  CheckCircle,
  ChevronDown,
  Gift,
  Loader2,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
  Save,
  ShieldCheck,
  StickyNote,
  User,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useTheme } from "@/lib/theme";
import { api, extractApiMessage } from "@/lib/api";

interface Address {
  id: string;
  type: "HOME" | "OFFICE" | "OTHER";
  label: string | null;
  area: string;
  landmark: string | null;
  fullText: string;
  lat: number | null;
  lng: number | null;
  isDefault: boolean;
  createdAt: string;
}

interface Order {
  id: string;
  orderNo: string;
  status: string;
  grandTotal: number;
  placedAt: string;
  deliveredAt: string | null;
}

interface Referral {
  id: string;
  referee: { id: string; name: string | null; phone: string };
  status: "PENDING" | "QUALIFIED" | "REWARDED" | "EXPIRED" | "CANCELLED";
  createdAt: string;
  rewardedAt: string | null;
}

interface CustomerDetail {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  isBlocked: boolean;
  referralCode: string;
  registeredAt: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  referredBy: { id: string; name: string | null; phone: string } | null;
  addresses: Address[];
  orders: Order[];
  referralsMade: Referral[];
  lifetimeValue: number;
  deliveredOrderCount: number;
  referralStats: { status: string; count: number }[];
  rewardStats: { totalIssued: number; totalAmount: number };
  _count: { orders: number; referralsMade: number; addresses: number; rewards: number };
}

const referralStatusVariant: Record<string, "warning" | "info" | "success" | "muted" | "danger"> = {
  PENDING: "warning",
  QUALIFIED: "info",
  REWARDED: "success",
  EXPIRED: "muted",
  CANCELLED: "danger",
};

const orderStatusVariant: Record<string, "warning" | "info" | "success" | "muted" | "danger"> = {
  PLACED: "info",
  CONFIRMED: "info",
  PREPARING: "warning",
  OUT_FOR_DELIVERY: "warning",
  DELIVERED: "success",
  CANCELLED: "danger",
  REFUNDED: "muted",
};

export default function CustomerDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const { lang } = useTheme();
  const qc = useQueryClient();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);

  const [note, setNote] = useState("");
  const [ordersOpen, setOrdersOpen] = useState(true);
  const [refsOpen, setRefsOpen] = useState(true);
  const [addrsOpen, setAddrsOpen] = useState(true);

  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ["admin", "customer", id],
    queryFn: () => api.get<CustomerDetail>(`/admin/customers/${id}`),
    enabled: !!id,
    retry: 1,
  });

  const toggleBlock = useMutation({
    mutationFn: (isBlocked: boolean) =>
      api.patch(`/admin/customers/${id}/block`, { isBlocked }),
    onSuccess: () => {
      toast.success(t("আপডেট হয়েছে", "Updated"));
      qc.invalidateQueries({ queryKey: ["admin", "customer", id] });
      qc.invalidateQueries({ queryKey: ["admin", "customers"] });
    },
    onError: (e) => toast.error(extractApiMessage(e, t("ব্যর্থ", "Failed"))),
  });

  const saveNote = useMutation({
    mutationFn: (notes: string) => api.post(`/admin/customers/${id}/notes`, { notes }),
    onSuccess: () => {
      toast.success(t("নোট সংরক্ষিত", "Note saved"));
      setNote("");
    },
    onError: (e) => toast.error(extractApiMessage(e, t("ব্যর্থ", "Failed"))),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">
          {t("কাস্টমার পাওয়া যায়নি", "Customer not found")}
        </p>
        <Button variant="outline" className="mt-4" onClick={() => router.push("/admin/customers")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          {t("তালিকায় ফিরুন", "Back to list")}
        </Button>
      </div>
    );
  }

  const fmtDate = (s: string | null) =>
    s ? new Date(s).toLocaleString(lang === "bn" ? "bn-BD" : "en-GB") : "—";
  const addrTypeLabel = (type: Address["type"]) =>
    type === "HOME" ? t("বাসা", "Home") : type === "OFFICE" ? t("অফিস", "Office") : t("অন্যান্য", "Other");

  return (
    <div className="space-y-4">
      {/* Header strip */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push("/admin/customers")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{data.name ?? t("নাম নেই", "Unnamed")}</h1>
              {data.isBlocked ? (
                <Badge variant="danger">{t("নিষিদ্ধ", "Blocked")}</Badge>
              ) : (
                <Badge variant="success">{t("সক্রিয়", "Active")}</Badge>
              )}
            </div>
            <div className="text-sm text-muted-foreground font-mono">{data.phone}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
          <Button
            variant={data.isBlocked ? "default" : "destructive"}
            onClick={() => toggleBlock.mutate(!data.isBlocked)}
            disabled={toggleBlock.isPending}
          >
            {data.isBlocked ? (
              <>
                <CheckCircle className="h-4 w-4 mr-2" />
                {t("আনব্লক", "Unblock")}
              </>
            ) : (
              <>
                <Ban className="h-4 w-4 mr-2" />
                {t("ব্লক", "Block")}
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">{t("মোট অর্ডার", "Total orders")}</div>
            <div className="text-2xl font-bold">{data._count.orders}</div>
            <div className="text-xs text-muted-foreground mt-1">
              {data.deliveredOrderCount} {t("ডেলিভার্ড", "delivered")}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">{t("লাইফটাইম ভ্যালু", "Lifetime value")}</div>
            <div className="text-2xl font-bold text-primary">
              ৳{data.lifetimeValue.toLocaleString("en-IN")}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">{t("রেফারেল", "Referrals")}</div>
            <div className="text-2xl font-bold">{data._count.referralsMade}</div>
            <div className="text-xs text-muted-foreground mt-1">
              {data.referralStats.find((s) => s.status === "REWARDED")?.count ?? 0} {t("পুরস্কৃত", "rewarded")}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">{t("রিওয়ার্ড", "Rewards")}</div>
            <div className="text-2xl font-bold">
              ৳{data.rewardStats.totalAmount.toLocaleString("en-IN")}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {data.rewardStats.totalIssued} {t("টি", "issued")}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Left column: profile + addresses + note */}
        <div className="space-y-4 lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <User className="h-4 w-4" />
                {t("প্রোফাইল", "Profile")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <span className="font-mono">{data.phone}</span>
              </div>
              {data.email && (
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span>{data.email}</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                <span>
                  {t("রেফারেল কোড", "Referral code")}: <span className="font-mono">{data.referralCode}</span>
                </span>
              </div>
              {data.referredBy && (
                <div className="rounded-md bg-ink-50 p-2 text-xs">
                  <div className="text-muted-foreground">
                    {t("রেফার করেছেন", "Referred by")}
                  </div>
                  <div className="font-medium">
                    {data.referredBy.name ?? data.referredBy.phone}
                  </div>
                </div>
              )}
              <div className="border-t pt-2 text-xs text-muted-foreground space-y-1">
                <div>{t("যোগদান", "Joined")}: {fmtDate(data.createdAt)}</div>
                {data.lastLoginAt && (
                  <div>{t("শেষ লগইন", "Last login")}: {fmtDate(data.lastLoginAt)}</div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <button
                type="button"
                onClick={() => setAddrsOpen((v) => !v)}
                className="flex w-full items-center justify-between"
              >
                <CardTitle className="text-base flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  {t("ঠিকানা", "Addresses")} ({data._count.addresses})
                </CardTitle>
                <ChevronDown className={`h-4 w-4 transition-transform ${addrsOpen ? "rotate-180" : ""}`} />
              </button>
            </CardHeader>
            {addrsOpen && (
              <CardContent className="space-y-2 text-sm">
                {data.addresses.length === 0 && (
                  <div className="text-muted-foreground text-xs">
                    {t("কোনো ঠিকানা নেই", "No addresses")}
                  </div>
                )}
                {data.addresses.map((a) => (
                  <div key={a.id} className="rounded-md border border-ink-200 p-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="muted">{addrTypeLabel(a.type)}</Badge>
                      {a.isDefault && <Badge variant="success">{t("ডিফল্ট", "Default")}</Badge>}
                      {!a.lat || !a.lng ? (
                        <Badge variant="warning" className="ml-auto">
                          {t("ম্যাপ নেই", "No map")}
                        </Badge>
                      ) : null}
                    </div>
                    <div className="mt-1 text-xs">{a.fullText}</div>
                    {a.area && (
                      <div className="text-xs text-muted-foreground">
                        {t("এলাকা", "Area")}: {a.area}
                      </div>
                    )}
                    {a.landmark && (
                      <div className="text-xs text-muted-foreground">
                        {t("ল্যান্ডমার্ক", "Landmark")}: {a.landmark}
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            )}
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <StickyNote className="h-4 w-4" />
                {t("নোট যোগ করুন", "Add admin note")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder={t("অভ্যন্তরীণ নোট...", "Internal note...")}
                className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
              />
              <Button
                size="sm"
                onClick={() => saveNote.mutate(note)}
                disabled={!note.trim() || saveNote.isPending}
              >
                <Save className="h-4 w-4 mr-2" />
                {t("সংরক্ষণ", "Save")}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Right column: orders + referrals */}
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <button
                type="button"
                onClick={() => setOrdersOpen((v) => !v)}
                className="flex w-full items-center justify-between"
              >
                <CardTitle className="text-base">
                  {t("সাম্প্রতিক অর্ডার", "Recent orders")} ({data._count.orders})
                </CardTitle>
                <ChevronDown className={`h-4 w-4 transition-transform ${ordersOpen ? "rotate-180" : ""}`} />
              </button>
            </CardHeader>
            {ordersOpen && (
              <CardContent>
                {data.orders.length === 0 ? (
                  <div className="text-xs text-muted-foreground">
                    {t("কোনো অর্ডার নেই", "No orders yet")}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-muted-foreground border-b">
                          <th className="py-2 pr-2">{t("অর্ডার", "Order")}</th>
                          <th className="py-2 pr-2">{t("অবস্থা", "Status")}</th>
                          <th className="py-2 pr-2 text-right">{t("মোট", "Total")}</th>
                          <th className="py-2">{t("তারিখ", "Date")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.orders.map((o) => (
                          <tr
                            key={o.id}
                            onClick={() => router.push(`/admin/orders/${o.id}`)}
                            className="border-b last:border-0 hover:bg-ink-50 cursor-pointer"
                          >
                            <td className="py-2 pr-2 font-mono text-xs">{o.orderNo}</td>
                            <td className="py-2 pr-2">
                              <Badge variant={orderStatusVariant[o.status] ?? "muted"}>
                                {o.status}
                              </Badge>
                            </td>
                            <td className="py-2 pr-2 text-right">
                              ৳{Number(o.grandTotal).toLocaleString("en-IN")}
                            </td>
                            <td className="py-2 text-xs">{fmtDate(o.placedAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            )}
          </Card>

          <Card>
            <CardHeader>
              <button
                type="button"
                onClick={() => setRefsOpen((v) => !v)}
                className="flex w-full items-center justify-between"
              >
                <CardTitle className="text-base flex items-center gap-2">
                  <Gift className="h-4 w-4" />
                  {t("রেফারেল", "Referrals made")} ({data._count.referralsMade})
                </CardTitle>
                <ChevronDown className={`h-4 w-4 transition-transform ${refsOpen ? "rotate-180" : ""}`} />
              </button>
            </CardHeader>
            {refsOpen && (
              <CardContent>
                {data.referralsMade.length === 0 ? (
                  <div className="text-xs text-muted-foreground">
                    {t("কাউকে রেফার করেননি", "No referrals yet")}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-muted-foreground border-b">
                          <th className="py-2 pr-2">{t("বন্ধু", "Referee")}</th>
                          <th className="py-2 pr-2">{t("অবস্থা", "Status")}</th>
                          <th className="py-2">{t("তারিখ", "Date")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.referralsMade.map((r) => (
                          <tr key={r.id} className="border-b last:border-0">
                            <td className="py-2 pr-2">
                              <div>{r.referee.name ?? "—"}</div>
                              <div className="text-xs text-muted-foreground font-mono">
                                {r.referee.phone}
                              </div>
                            </td>
                            <td className="py-2 pr-2">
                              <Badge variant={referralStatusVariant[r.status] ?? "muted"}>
                                {r.status}
                              </Badge>
                            </td>
                            <td className="py-2 text-xs">{fmtDate(r.createdAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}