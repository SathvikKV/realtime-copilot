"use client"

import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";


interface HeaderProps {
  isConnected: boolean
  roomName: string
  setRoomName: (name: string) => void
  identity: string
  setIdentity: (id: string) => void
  onJoin: () => void
  onLeave: () => void
  isLoading: boolean
}

export default function Header({
  isConnected,
  roomName,
  setRoomName,
  identity,
  setIdentity,
  onJoin,
  onLeave,
  isLoading,
}: HeaderProps) {
  return (
    <header className="border-b border-white/10 bg-white/5 backdrop-blur-md p-4">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        {/* Title and status */}
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-white">Realtime Copilot</h1>
          <div
            className={`px-3 py-1 rounded-full text-xs font-medium ring-1 ${
              isConnected
                ? "bg-green-500/20 text-green-300 ring-green-500/40"
                : "bg-slate-500/20 text-slate-300 ring-slate-500/40"
            }`}
          >
            {isConnected ? "● Connected" : "● Disconnected"}
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="flex gap-2">
            <Input
              type="text"
              placeholder="Room name"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              disabled={isConnected}
              className="w-32"
            />
            <Input
              type="text"
              placeholder="Identity"
              value={identity}
              onChange={(e) => setIdentity(e.target.value)}
              disabled={isConnected}
              className="w-32"
            />
          </div>

          {isConnected ? (
            <Button variant="destructive" onClick={onLeave} isLoading={isLoading}>
              Leave
            </Button>
          ) : (
            <Button variant="primary" onClick={onJoin} isLoading={isLoading}>
              Join
            </Button>
          )}
        </div>
      </div>
    </header>
  )
}
