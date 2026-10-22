"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { getCurrentUser } from "@/lib/auth";
import { driveUsageApi } from "@/lib/api";
import { toast } from "sonner";
import { PieChart, HardDrive, FileText, ImageIcon, Video, Music, Archive } from "lucide-react";

function formatFileSize(bytes: bigint): string {
  if (bytes === BigInt(0)) return "0 Bytes";
  const k = BigInt(1024);
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  let i = 0;
  let value = bytes;
  while (value >= k && i < sizes.length - 1) {
    value = value / k;
    i++;
  }
  const divisor = k ** BigInt(i);
  const num = Number(bytes) / Number(divisor);
  return `${num.toFixed(2)} ${sizes[i]}`;
}

interface StorageStats {
  totalSize: bigint;
  usedSize: bigint;
  availableSize: bigint;
  usagePercentage: number;
  fileCount: number;
  byType: {
    documents: { size: bigint; count: number };
    images: { size: bigint; count: number };
    videos: { size: bigint; count: number };
    audio: { size: bigint; count: number };
    archives: { size: bigint; count: number };
    other: { size: bigint; count: number };
  };
}

export default function DriveUsagePage() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<StorageStats>({
    totalSize: BigInt(10737418240), // 10 GB default
    usedSize: BigInt(0),
    availableSize: BigInt(10737418240),
    usagePercentage: 0,
    fileCount: 0,
    byType: {
      documents: { size: BigInt(0), count: 0 },
      images: { size: BigInt(0), count: 0 },
      videos: { size: BigInt(0), count: 0 },
      audio: { size: BigInt(0), count: 0 },
      archives: { size: BigInt(0), count: 0 },
      other: { size: BigInt(0), count: 0 }
    }
  });

  useEffect(() => {
    fetchDriveUsage();
  }, []);

  const fetchDriveUsage = async () => {
    try {
      setLoading(true);
      const user = getCurrentUser();
      if (!user) {
        toast.error("User not found");
        return;
      }

      const data = await driveUsageApi.getDriveUsage({
        companyId: user.companyId || undefined,
        branchId: user.branchId || undefined
      });

      setStats({
        totalSize: BigInt(data.totalSize || "0"),
        usedSize: BigInt(data.usedSize || "0"),
        availableSize: BigInt(data.availableSize || "0"),
        usagePercentage: data.usagePercentage || 0,
        fileCount: data.fileCount || 0,
        byType: {
          documents: { size: BigInt(data.byType?.documents?.size || "0"), count: data.byType?.documents?.count || 0 },
          images: { size: BigInt(data.byType?.images?.size || "0"), count: data.byType?.images?.count || 0 },
          videos: { size: BigInt(data.byType?.videos?.size || "0"), count: data.byType?.videos?.count || 0 },
          audio: { size: BigInt(data.byType?.audio?.size || "0"), count: data.byType?.audio?.count || 0 },
          archives: { size: BigInt(data.byType?.archives?.size || "0"), count: data.byType?.archives?.count || 0 },
          other: { size: BigInt(data.byType?.other?.size || "0"), count: data.byType?.other?.count || 0 },
        }
      });
    } catch (error: any) {
      console.error("Failed to fetch drive usage:", error);
      toast.error("Failed to load drive usage data");
    } finally {
      setLoading(false);
    }
  };

  const typeCards = [
    {
      label: "Documents",
      icon: FileText,
      size: stats.byType.documents.size,
      count: stats.byType.documents.count,
      color: "text-blue-500",
      bgColor: "bg-blue-500/10"
    },
    {
      label: "Images",
      icon: ImageIcon,
      size: stats.byType.images.size,
      count: stats.byType.images.count,
      color: "text-green-500",
      bgColor: "bg-green-500/10"
    },
    {
      label: "Videos",
      icon: Video,
      size: stats.byType.videos.size,
      count: stats.byType.videos.count,
      color: "text-purple-500",
      bgColor: "bg-purple-500/10"
    },
    {
      label: "Audio",
      icon: Music,
      size: stats.byType.audio.size,
      count: stats.byType.audio.count,
      color: "text-orange-500",
      bgColor: "bg-orange-500/10"
    },
    {
      label: "Archives",
      icon: Archive,
      size: stats.byType.archives.size,
      count: stats.byType.archives.count,
      color: "text-yellow-500",
      bgColor: "bg-yellow-500/10"
    },
    {
      label: "Other",
      icon: HardDrive,
      size: stats.byType.other.size,
      count: stats.byType.other.count,
      color: "text-gray-500",
      bgColor: "bg-gray-500/10"
    }
  ];

  return (
    <>
      <div className="flex items-center justify-between space-y-2">
        <h1 className="text-lg font-bold tracking-tight">Drive Usage</h1>
      </div>

      <div className="w-full space-y-6">

      {/* Overall Storage Card */}
      <Card>
        <CardHeader>
          <CardTitle>Storage Overview</CardTitle>
          <CardDescription>Total storage usage across all files</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {formatFileSize(stats.usedSize)} used of {formatFileSize(stats.totalSize)}
            </span>
            <span className="text-muted-foreground">
              {formatFileSize(stats.availableSize)} available
            </span>
          </div>
          <Progress value={stats.usagePercentage} className="h-2" />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{stats.fileCount} files</span>
            <span>{stats.usagePercentage.toFixed(1)}% used</span>
          </div>
        </CardContent>
      </Card>

      {/* Storage by Type */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Storage by File Type</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {typeCards.map((type) => {
            const Icon = type.icon;
            const percentage = stats.usedSize > BigInt(0)
              ? (Number(type.size) / Number(stats.usedSize)) * 100
              : 0;

            return (
              <Card key={type.label}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className={`p-2 rounded-lg ${type.bgColor}`}>
                      <Icon className={`h-5 w-5 ${type.color}`} />
                    </div>
                    <span className="text-sm font-medium">{formatFileSize(type.size)}</span>
                  </div>
                  <CardTitle className="text-base mt-2">{type.label}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <Progress value={percentage} className="h-1.5" />
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{type.count} files</span>
                      <span>{percentage.toFixed(1)}%</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
      </div>
    </>
  );
}

