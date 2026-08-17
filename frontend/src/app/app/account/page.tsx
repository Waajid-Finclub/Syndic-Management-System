"use client";

/**
 * Account — identity, property, notification channels, support.
 *
 * Editable and non-editable are visually distinct on purpose. Contact details
 * are the resident's to change; the unit, block, share allocation and the bays
 * attached to it are the syndic's record about them, so they are presented as
 * facts with no affordance suggesting otherwise.
 *
 * The language row is read-only because only English ships today. A switch
 * that changes nothing is worse than no switch.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Bell,
  Building2,
  ChevronRight,
  CircleCheck,
  FileText,
  Globe,
  Lock,
  LogOut,
  Mail,
  MessageSquare,
  Phone,
  Smartphone,
  SquareParking,
  TriangleAlert,
  User,
  Warehouse,
  Zap,
} from "lucide-react";
import { Sheet } from "@/components/resident/sheet";
import {
  Card,
  Notice,
  ScreenHeader,
  ScreenSkeleton,
  StaleDataNotice,
  SectionTitle,
  rs,
} from "@/components/resident/ui";
import { api } from "@/lib/api";
import { useAction, useOnline, useResidentApi } from "@/lib/resident/hooks";
import { useResidentSession } from "@/lib/resident/session";
import type {
  ParkingBay,
  ResidentPreferences,
  ResidentUnit,
  ResidentUser,
  StorageUnit,
} from "@/lib/resident/types";

type ProfilePayload = {
  user: ResidentUser;
  unit: ResidentUnit;
  assets: { parking: ParkingBay[]; ev_bays: ParkingBay[]; storage: StorageUnit[] };
  preferences: ResidentPreferences;
  syndic: {
    manager_name: string | null;
    manager_email: string | null;
    development_name: string | null;
  };
};

const CHANNELS = [
  { key: "push_notifications", label: "In-app alerts", icon: Bell },
  { key: "whatsapp_notifications", label: "WhatsApp", icon: MessageSquare },
  { key: "email_notifications", label: "Email", icon: Mail },
  { key: "sms_notifications", label: "SMS", icon: Smartphone },
] as const;

export default function AccountScreen() {
  const router = useRouter();
  const online = useOnline();
  const { signOut, setPreferences } = useResidentSession();

  const { data, loading, reload, setData, stale } = useResidentApi<ProfilePayload>(
    "/api/resident/account/profile",
  );

  const [editOpen, setEditOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordChanged, setPasswordChanged] = useState(false);

  function openEditProfile() {
    if (!data) return;
    setFirstName(data.user.first_name);
    setLastName(data.user.last_name ?? "");
    setPhone(data.user.phone ?? "");
    setEditOpen(true);
  }


  const saveProfile = useAction(async () => {
    await api("/api/resident/account/profile", {
      method: "PUT",
      body: { first_name: firstName.trim(), last_name: lastName.trim(), phone: phone.trim() },
    });
    setEditOpen(false);
    await reload();
  });

  const changePassword = useAction(async () => {
    await api("/api/resident/auth/change-password", {
      method: "POST",
      body: { current_password: currentPassword, new_password: newPassword },
    });
    setPasswordOpen(false);
    setCurrentPassword("");
    setNewPassword("");
    setPasswordChanged(true);
  });

  const toggleChannel = useAction(async (key: string, value: boolean) => {
    const payload = await api<{ preferences: ResidentPreferences }>(
      "/api/resident/account/preferences",
      { method: "PUT", body: { [key]: value } },
    );
    setPreferences(payload.preferences);
    setData(data ? { ...data, preferences: payload.preferences } : data);
  });

  if (loading && !data) {
    return (
      <div className="r-screen">
        <ScreenHeader title="My account" />
        <ScreenSkeleton rows={5} />
      </div>
    );
  }

  if (!data) return null;

  const { user, unit, assets, preferences, syndic } = data;

  return (
    <div className="r-screen">
      <ScreenHeader title="My account" />

      {stale ? <StaleDataNotice /> : null}

      <Card accent>
        <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
          <span
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 52,
              height: 52,
              borderRadius: 17,
              background: "linear-gradient(140deg, var(--cr), var(--cb))",
              color: "#fff",
              fontSize: 17,
              fontWeight: 700,
            }}
          >
            {user.initials}
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.02em" }}>
              {user.name}
            </div>
            <div className="r-muted">
              {user.role_display} · Unit {unit.label}
              {unit.block_name ? ` · ${unit.block_name}` : ""}
            </div>
            {unit.tenure === "owner" ? (
              <div className="r-mono r-muted" style={{ fontSize: 10, marginTop: 1 }}>
                {unit.share_value.toLocaleString("en-GB")} / {unit.total_shares.toLocaleString("en-GB")} shares
                ({unit.share_percent}%)
              </div>
            ) : null}
          </div>
        </div>
      </Card>

      {passwordChanged ? (
        <Notice icon={CircleCheck} tone="ok">
          Your password has been changed.
        </Notice>
      ) : null}

      <SectionTitle>My property</SectionTitle>
      <div className="r-list">
        <div className="r-row">
          <span className="r-row__mark tint-neutral">
            <Building2 size={15} />
          </span>
          <span className="r-row__body">
            <span className="r-row__title">Unit</span>
            <span className="r-row__sub">
              {unit.label} · {unit.unit_type}
              {unit.area_sqm ? ` · ${unit.area_sqm} m²` : ""}
            </span>
          </span>
        </div>

        {unit.tenure === "owner" ? (
          <div className="r-row">
            <span className="r-row__mark tint-neutral">
              <FileText size={15} />
            </span>
            <span className="r-row__body">
              <span className="r-row__title">Monthly service charge</span>
              <span className="r-row__sub">
                {rs(unit.monthly_charge)} · apportioned by share
              </span>
            </span>
          </div>
        ) : null}

        {assets.parking.map((bay) => (
          <button
            className="r-row"
            key={bay.id}
            onClick={() => router.push("/app/assets/parking")}
            type="button"
          >
            <span className="r-row__mark tint-blu">
              <SquareParking size={15} />
            </span>
            <span className="r-row__body">
              <span className="r-row__title">Parking bay</span>
              <span className="r-row__sub">
                {bay.code} · level {bay.level ?? "—"}
              </span>
            </span>
            <ChevronRight className="text-mt" size={16} />
          </button>
        ))}

        {assets.ev_bays.map((bay) => (
          <button
            className="r-row"
            key={bay.id}
            onClick={() => router.push("/app/assets/ev")}
            type="button"
          >
            <span className="r-row__mark tint-tl">
              <Zap size={15} />
            </span>
            <span className="r-row__body">
              <span className="r-row__title">EV charging bay</span>
              <span className="r-row__sub">
                {bay.code} · {bay.charger_kw} kW {bay.charger_type}
              </span>
            </span>
            <ChevronRight className="text-mt" size={16} />
          </button>
        ))}

        {assets.storage.map((store) => (
          <button
            className="r-row"
            key={store.id}
            onClick={() => router.push("/app/assets/storage")}
            type="button"
          >
            <span className="r-row__mark tint-wn">
              <Warehouse size={15} />
            </span>
            <span className="r-row__body">
              <span className="r-row__title">Storage unit</span>
              <span className="r-row__sub">
                {store.code} · {store.area_sqm} m²
              </span>
            </span>
            <ChevronRight className="text-mt" size={16} />
          </button>
        ))}
      </div>

      <SectionTitle>Account</SectionTitle>
      <div className="r-list">
        <button className="r-row" onClick={openEditProfile} type="button">
          <span className="r-row__mark tint-neutral">
            <User size={15} />
          </span>
          <span className="r-row__body">
            <span className="r-row__title">Personal information</span>
            <span className="r-row__sub">{user.email}</span>
          </span>
          <ChevronRight className="text-mt" size={16} />
        </button>

        <button className="r-row" onClick={() => setPasswordOpen(true)} type="button">
          <span className="r-row__mark tint-neutral">
            <Lock size={15} />
          </span>
          <span className="r-row__body">
            <span className="r-row__title">Change password</span>
          </span>
          <ChevronRight className="text-mt" size={16} />
        </button>

        <button
          className="r-row"
          onClick={() => router.push("/app/account/notifications")}
          type="button"
        >
          <span className="r-row__mark tint-neutral">
            <Bell size={15} />
          </span>
          <span className="r-row__body">
            <span className="r-row__title">Notifications</span>
          </span>
          <ChevronRight className="text-mt" size={16} />
        </button>
      </div>

      <SectionTitle>How we contact you</SectionTitle>
      {toggleChannel.error ? (
        <Notice icon={TriangleAlert} tone="er">
          {toggleChannel.error}
        </Notice>
      ) : null}
      <div className="r-list">
        {CHANNELS.map((channel) => {
          const Icon = channel.icon;
          const value = preferences[channel.key];
          const needsPhone =
            channel.key === "whatsapp_notifications" || channel.key === "sms_notifications";
          const blocked = needsPhone && !user.phone;

          return (
            <div className="r-row" key={channel.key}>
              <span className="r-row__mark tint-neutral">
                <Icon size={15} />
              </span>
              <span className="r-row__body">
                <span className="r-row__title">{channel.label}</span>
                {blocked ? (
                  <span className="r-row__sub">Add a mobile number to enable this</span>
                ) : null}
              </span>
              <button
                aria-checked={value}
                aria-label={channel.label}
                className={`toggle ${value ? "is-on" : ""}`}
                disabled={blocked || toggleChannel.pending || !online}
                onClick={() => void toggleChannel.run(channel.key, !value)}
                role="switch"
                type="button"
              >
                <span className="toggle__thumb" />
              </button>
            </div>
          );
        })}
      </div>

      <SectionTitle>Preferences</SectionTitle>
      <div className="r-list">
        <div className="r-row">
          <span className="r-row__mark tint-neutral">
            <Globe size={15} />
          </span>
          <span className="r-row__body">
            <span className="r-row__title">Language</span>
            <span className="r-row__sub">English — French is not available yet</span>
          </span>
        </div>
      </div>

      <SectionTitle>Support</SectionTitle>
      <div className="r-list">
        <div className="r-row">
          <span className="r-row__mark tint-neutral">
            <Building2 size={15} />
          </span>
          <span className="r-row__body">
            <span className="r-row__title">Syndic manager</span>
            <span className="r-row__sub">
              {syndic.manager_name ?? "—"} · {syndic.development_name}
            </span>
          </span>
        </div>
        {syndic.manager_email ? (
          <a className="r-row" href={`mailto:${syndic.manager_email}`}>
            <span className="r-row__mark tint-neutral">
              <Mail size={15} />
            </span>
            <span className="r-row__body">
              <span className="r-row__title">Email your manager</span>
              <span className="r-row__sub">{syndic.manager_email}</span>
            </span>
            <ChevronRight className="text-mt" size={16} />
          </a>
        ) : null}
        {user.phone ? (
          <div className="r-row">
            <span className="r-row__mark tint-neutral">
              <Phone size={15} />
            </span>
            <span className="r-row__body">
              <span className="r-row__title">Your number</span>
              <span className="r-row__sub">{user.phone}</span>
            </span>
          </div>
        ) : null}
      </div>

      <button
        className="r-btn r-btn--danger r-btn--block"
        onClick={() => void signOut()}
        style={{ marginTop: 18 }}
        type="button"
      >
        <LogOut size={15} />
        Sign out
      </button>

      <div
        className="r-mono r-muted"
        style={{ textAlign: "center", marginTop: 14, fontSize: 10 }}
      >
        SyndicMS Co-Owner Portal · {syndic.development_name}
      </div>

      <Sheet
        onClose={() => setEditOpen(false)}
        open={editOpen}
        subtitle="Your unit and share allocation are held by your syndic and cannot be changed here."
        title="Personal information"
      >
        {saveProfile.error ? (
          <Notice icon={TriangleAlert} tone="er">
            {saveProfile.error}
          </Notice>
        ) : null}

        <SheetField label="First name" onChange={setFirstName} value={firstName} />
        <SheetField label="Last name" onChange={setLastName} value={lastName} />
        <SheetField
          label="Mobile number"
          onChange={setPhone}
          placeholder="+230 5xxx xxxx"
          type="tel"
          value={phone}
        />
        <p className="r-muted" style={{ marginBottom: 12, lineHeight: 1.55 }}>
          Removing your number turns off WhatsApp and SMS notifications.
        </p>

        <div className="r-btn-row" style={{ marginTop: 0 }}>
          <button className="r-btn" onClick={() => setEditOpen(false)} type="button">
            Cancel
          </button>
          <button
            className="r-btn r-btn--primary"
            disabled={saveProfile.pending || !firstName.trim() || !online}
            onClick={() => void saveProfile.run()}
            type="button"
          >
            {saveProfile.pending ? "Saving…" : "Save"}
          </button>
        </div>
      </Sheet>

      <Sheet
        onClose={() => setPasswordOpen(false)}
        open={passwordOpen}
        subtitle="Use at least 10 characters."
        title="Change password"
      >
        {changePassword.error ? (
          <Notice icon={TriangleAlert} tone="er">
            {changePassword.error}
          </Notice>
        ) : null}

        <SheetField
          label="Current password"
          onChange={setCurrentPassword}
          type="password"
          value={currentPassword}
        />
        <SheetField
          label="New password"
          onChange={setNewPassword}
          type="password"
          value={newPassword}
        />

        <div className="r-btn-row" style={{ marginTop: 0 }}>
          <button className="r-btn" onClick={() => setPasswordOpen(false)} type="button">
            Cancel
          </button>
          <button
            className="r-btn r-btn--primary"
            disabled={changePassword.pending || newPassword.length < 10 || !online}
            onClick={() => void changePassword.run()}
            type="button"
          >
            {changePassword.pending ? "Saving…" : "Change password"}
          </button>
        </div>
      </Sheet>
    </div>
  );
}

function SheetField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div className="r-field">
      <label className="r-field__label">{label}</label>
      <div className="r-input">
        <input
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          type={type}
          value={value}
        />
      </div>
    </div>
  );
}
