import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Mail, MessageSquare, Send, Loader2, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { toast } from "sonner";
import { useLeadMessages, useSendLeadEmail, useSendLeadSms } from "@/hooks/useLeadMessages";
import { formatDate } from "@/lib/dateUtils";
import type { Plan } from "@/hooks/useSubscription";

interface LeadOutreachDialogProps {
  open: boolean;
  onClose: () => void;
  lead: { id: string; fullName: string; email: string | null; phone: string | null };
  companyId: string;
  plan: Plan;
}

const PLANS_WITH_EMAIL = new Set<Plan>(["starter", "growth", "unlimited"]);
const PLANS_WITH_SMS  = new Set<Plan>(["unlimited"]);

type Channel = "email" | "sms";

export function LeadOutreachDialog({ open, onClose, lead, companyId, plan }: LeadOutreachDialogProps) {
  // Default to SMS if lead has no email (or email plan not available)
  const defaultChannel: Channel = lead.email && PLANS_WITH_EMAIL.has(plan) ? "email" : "sms";
  const [channel, setChannel] = useState<Channel>(defaultChannel);
  const [subject, setSubject] = useState("");
  const [body, setBody]       = useState("");

  const canEmail = PLANS_WITH_EMAIL.has(plan) && !!lead.email;
  const canSms   = PLANS_WITH_SMS.has(plan)   && !!lead.phone;

  const { data: messages = [], isLoading: loadingMsgs } = useLeadMessages(
    open ? lead.id : null,
    companyId,
  );

  const sendEmail = useSendLeadEmail();
  const sendSms   = useSendLeadSms();

  const isPending = sendEmail.isPending || sendSms.isPending;

  const handleSend = () => {
    if (!body.trim()) return;

    if (channel === "email") {
      if (!canEmail) {
        toast.error("Email outreach requires Starter plan or higher.");
        return;
      }
      if (!lead.email) {
        toast.error("This lead has no email address on file.");
        return;
      }
      sendEmail.mutate(
        { leadId: lead.id, subject: subject.trim() || `Hi from CDL Jobs Center`, body: body.trim() },
        {
          onSuccess: () => {
            toast.success("Email sent!");
            setSubject("");
            setBody("");
          },
          onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to send email"),
        },
      );
    } else {
      if (!canSms) {
        toast.error("SMS outreach requires Unlimited plan.");
        return;
      }
      if (!lead.phone) {
        toast.error("This lead has no phone number on file.");
        return;
      }
      sendSms.mutate(
        { leadId: lead.id, body: body.trim() },
        {
          onSuccess: () => {
            toast.success("SMS sent!");
            setBody("");
          },
          onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to send SMS"),
        },
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg flex flex-col gap-0 p-0 max-h-[85vh]">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle className="text-base">
            Outreach — <span className="text-primary">{lead.fullName}</span>
          </DialogTitle>
          <div className="flex gap-1 text-xs text-muted-foreground mt-1">
            {lead.email && <span>{lead.email}</span>}
            {lead.email && lead.phone && <span>·</span>}
            {lead.phone && <span>{lead.phone}</span>}
          </div>
        </DialogHeader>

        <Separator />

        {/* Message thread */}
        <ScrollArea className="flex-1 min-h-0 px-6 py-4">
          {loadingMsgs ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : messages.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No messages yet. Send the first one below.
            </p>
          ) : (
            <div className="space-y-3">
              {messages.map((msg) => {
                const isOut = msg.direction === "outbound";
                return (
                  <div key={msg.id} className={`flex flex-col gap-1 ${isOut ? "items-end" : "items-start"}`}>
                    <div className={`rounded-2xl px-4 py-2.5 max-w-[85%] text-sm ${
                      isOut
                        ? "bg-primary text-primary-foreground rounded-br-sm"
                        : "bg-muted text-foreground rounded-bl-sm"
                    }`}>
                      {msg.channel === "email" && msg.subject && (
                        <p className="font-semibold text-xs mb-1 opacity-80">{msg.subject}</p>
                      )}
                      <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground px-1">
                      {isOut
                        ? <ArrowUpRight className="h-3 w-3" />
                        : <ArrowDownLeft className="h-3 w-3" />}
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                        {msg.channel === "email" ? "Email" : "SMS"}
                      </Badge>
                      <span>{formatDate(msg.createdAt)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>

        <Separator />

        {/* Compose area */}
        <div className="px-6 py-4 space-y-3">
          {/* Channel selector */}
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={channel === "email" ? "default" : "outline"}
              className="gap-1.5 text-xs"
              onClick={() => setChannel("email")}
              disabled={!canEmail}
              title={!lead.email ? "No email on file" : !PLANS_WITH_EMAIL.has(plan) ? "Requires Starter plan" : undefined}
            >
              <Mail className="h-3.5 w-3.5" />
              Email
              {!lead.email
                ? <span className="text-[10px] opacity-60 ml-1">No email</span>
                : !PLANS_WITH_EMAIL.has(plan) && <span className="text-[10px] opacity-60 ml-1">Starter+</span>}
            </Button>
            <Button
              size="sm"
              variant={channel === "sms" ? "default" : "outline"}
              className="gap-1.5 text-xs"
              onClick={() => setChannel("sms")}
              disabled={!canSms}
              title={!lead.phone ? "No phone on file" : !PLANS_WITH_SMS.has(plan) ? "Requires Unlimited plan" : undefined}
            >
              <MessageSquare className="h-3.5 w-3.5" />
              SMS
              {!lead.phone
                ? <span className="text-[10px] opacity-60 ml-1">No phone</span>
                : !PLANS_WITH_SMS.has(plan) && <span className="text-[10px] opacity-60 ml-1">Unlimited</span>}
            </Button>
          </div>

          {channel === "email" && (
            <div className="space-y-1">
              <Label htmlFor="outreach-subject" className="text-xs">Subject</Label>
              <Input
                id="outreach-subject"
                placeholder="e.g. CDL opportunity — looking for drivers"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="text-sm h-8"
              />
            </div>
          )}

          <div className="space-y-1">
            <Label htmlFor="outreach-body" className="text-xs">Message</Label>
            <Textarea
              id="outreach-body"
              placeholder={channel === "email"
                ? "Hi [Name], we saw your profile and think you'd be a great fit..."
                : "Hi! This is [Company]. We have a CDL opportunity that matches your profile..."}
              rows={4}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="text-sm resize-none"
            />
            {channel === "sms" && (
              <p className="text-xs text-muted-foreground text-right">{body.length}/160</p>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button
              size="sm"
              disabled={!body.trim() || isPending || (channel === "email" && !canEmail) || (channel === "sms" && !canSms)}
              onClick={handleSend}
              className="gap-1.5"
            >
              {isPending
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Send className="h-3.5 w-3.5" />}
              Send {channel === "email" ? "Email" : "SMS"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
