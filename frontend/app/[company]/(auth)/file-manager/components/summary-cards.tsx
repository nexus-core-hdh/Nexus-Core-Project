"use client";

import { useState, useEffect } from "react";
import { FileText, Video, File, ImageIcon, ArrowRightIcon } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";

import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import CountAnimation from "@/components/ui/custom/count-animation";
import { Progress } from "@/components/ui/progress";
import Link from "@/components/app-link";
import { fileApi } from "@/lib/api";
import { toast } from "sonner";

interface DataType {
  type: string;
  icon: React.ReactNode;
  count: number;
  size: string;
  color: string;
  indicatorColor: string;
  usagePercentage: number;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

export function SummaryCards() {
  const [data, setData] = useState<DataType[]>([
    {
      type: "Documents",
      icon: <FileText className="size-6" />,
      count: 0,
      size: "0 Bytes",
      color: "text-blue-500",
      indicatorColor: "bg-blue-500",
      usagePercentage: 0
    },
    {
      type: "Images",
      icon: <ImageIcon className="size-6" />,
      count: 0,
      size: "0 Bytes",
      color: "text-green-500",
      indicatorColor: "bg-green-500",
      usagePercentage: 0
    },
    {
      type: "Videos",
      icon: <Video className="size-6" />,
      count: 0,
      size: "0 Bytes",
      color: "text-red-500",
      indicatorColor: "bg-red-500",
      usagePercentage: 0
    },
    {
      type: "Others",
      icon: <File className="size-6" />,
      count: 0,
      size: "0 Bytes",
      color: "text-yellow-500",
      indicatorColor: "bg-yellow-500",
      usagePercentage: 0
    }
  ]);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const currentUser = getCurrentUser();
        const stats = await fileApi.getFileStats({
          companyId: currentUser?.companyId || undefined,
          branchId: currentUser?.branchId || undefined
        });

        const totalSize = stats.totalSize || 1; // Avoid division by zero

        const newData: DataType[] = [
          {
            type: "Documents",
            icon: <FileText className="size-6" />,
            count: stats.documents?.count || 0,
            size: formatFileSize(stats.documents?.size || 0),
            color: "text-blue-500",
            indicatorColor: "bg-blue-500",
            usagePercentage: totalSize > 0 ? Math.round((stats.documents?.size || 0) / totalSize * 100) : 0
          },
          {
            type: "Images",
            icon: <ImageIcon className="size-6" />,
            count: stats.images?.count || 0,
            size: formatFileSize(stats.images?.size || 0),
            color: "text-green-500",
            indicatorColor: "bg-green-500",
            usagePercentage: totalSize > 0 ? Math.round((stats.images?.size || 0) / totalSize * 100) : 0
          },
          {
            type: "Videos",
            icon: <Video className="size-6" />,
            count: stats.videos?.count || 0,
            size: formatFileSize(stats.videos?.size || 0),
            color: "text-red-500",
            indicatorColor: "bg-red-500",
            usagePercentage: totalSize > 0 ? Math.round((stats.videos?.size || 0) / totalSize * 100) : 0
          },
          {
            type: "Others",
            icon: <File className="size-6" />,
            count: stats.others?.count || 0,
            size: formatFileSize(stats.others?.size || 0),
            color: "text-yellow-500",
            indicatorColor: "bg-yellow-500",
            usagePercentage: totalSize > 0 ? Math.round((stats.others?.size || 0) / totalSize * 100) : 0
          }
        ];

        setData(newData);
      } catch (error) {
        console.error("Failed to fetch file stats:", error);
        toast.error("Failed to load file statistics");
      }
    };

    fetchStats();
  }, []);
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {data.map((item, key) => (
        <Card key={key} className="pb-0">
          <CardHeader>
            <CardTitle>{item.type}</CardTitle>
            <CardAction>
              <span className={item.color}>{item.icon}</span>
            </CardAction>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="font-display text-2xl lg:text-3xl">
              <CountAnimation number={item.count} />
            </div>
            <div className="space-y-2">
              <Progress value={item.usagePercentage} indicatorColor={item.indicatorColor} />
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-sm">{item.size} used</span>
                <span className="text-muted-foreground text-sm">{item.usagePercentage}%</span>
              </div>
            </div>
          </CardContent>
          <CardFooter className="border-border flex items-center justify-end border-t p-0!">
            <Link
              href={`/file-manager/all?type=${item.type}`}
              className="text-primary hover:text-primary/90 flex items-center px-6 py-3 text-sm font-medium">
              View more <ArrowRightIcon className="ms-1 size-4" />
            </Link>
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}
