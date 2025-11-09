"use client";

import Button from "@/components/ui/Button";
import Toggle from "@/components/ui/Toggle";
import Card from "@/components/ui/Card";

type ControlBarProps = Readonly<{
  isConnected: boolean;
  isScreenSharing: boolean;
  isMicOn: boolean;
  isLoading: boolean;
  autoCtx: boolean;

  onStartScreenShare: () => void;
  onStopScreenShare: () => void;
  onMicToggle: () => void;
  onDescribeScene: () => void;
  onWhatChanged: () => void;
  onExplainError: () => void;
  onCompareScreens: () => void;
  onSummarizeSession: () => void;
  onAutoContextToggle: (pressed: boolean) => void;
  onExtractText?: () => void;
}>;

export default function ControlBar({
  isConnected,
  isScreenSharing,
  isMicOn,
  isLoading,
  autoCtx,
  onStartScreenShare,
  onStopScreenShare,
  onMicToggle,
  onDescribeScene,
  onWhatChanged,
  onExplainError,
  onCompareScreens,
  onSummarizeSession,
  onAutoContextToggle,
  onExtractText,
}: ControlBarProps) {
  const shareDisabled = !isConnected || isLoading;
  const actionDisabled = !isConnected || isLoading;

  return (
    <Card className="p-4 space-y-3">
      {/* Primary controls */}
      <div className="flex flex-wrap gap-2">
        {isScreenSharing ? (
          <Button
            variant="destructive"
            size="sm"
            onClick={onStopScreenShare}
            isLoading={isLoading}
            disabled={shareDisabled}
          >
            Stop Share
          </Button>
        ) : (
          <Button
            variant="primary"
            size="sm"
            onClick={onStartScreenShare}
            isLoading={isLoading}
            disabled={shareDisabled}
          >
            Start Share
          </Button>
        )}

        <Button
          variant={isMicOn ? "primary" : "secondary"}
          size="sm"
          onClick={onMicToggle}
          isLoading={isLoading}
          disabled={actionDisabled}
        >
          {isMicOn ? "Mic On" : "Mic Off"}
        </Button>

        <Button
          variant="secondary"
          size="sm"
          onClick={onDescribeScene}
          isLoading={isLoading}
          disabled={actionDisabled}
        >
          Describe
        </Button>

        <Button
          variant="secondary"
          size="sm"
          onClick={onExtractText}
          isLoading={isLoading}
          disabled={!isConnected}
        >
          Extract Text
        </Button>

        <Button
          variant="secondary"
          size="sm"
          onClick={onWhatChanged}
          isLoading={isLoading}
          disabled={actionDisabled}
        >
          What Changed?
        </Button>
      </div>

      {/* Secondary actions */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={onExplainError}
          isLoading={isLoading}
          disabled={actionDisabled}
        >
          Explain Error
        </Button>

        <Button
          variant="secondary"
          size="sm"
          onClick={onCompareScreens}
          isLoading={isLoading}
          disabled={actionDisabled}
        >
          Compare
        </Button>

        <Button
          variant="secondary"
          size="sm"
          onClick={onSummarizeSession}
          isLoading={isLoading}
          disabled={actionDisabled}
        >
          Summarize
        </Button>

        <Toggle
          pressed={autoCtx}
          onPressedChange={onAutoContextToggle}
          className="text-sm ml-auto"
        >
          Auto Context {autoCtx ? "ON" : "OFF"}
        </Toggle>
      </div>
    </Card>
  );
}
