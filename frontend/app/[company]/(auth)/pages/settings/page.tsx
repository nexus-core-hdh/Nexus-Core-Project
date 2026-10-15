"use client";

import Link from "@/components/app-link";
import { zodResolver } from "@hookform/resolvers/zod";
import { cn } from "@/lib/utils";
import { useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";
import { toast } from "sonner";
import { CircleUserRoundIcon, Trash2Icon } from "lucide-react";
import { useEffect, useState } from "react";
import { useFileUpload } from "@/hooks/use-file-upload";
import { settingsApi, uploadApi } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const profileFormSchema = z.object({
  username: z
    .string()
    .min(2, {
      message: "Username must be at least 2 characters."
    })
    .max(30, {
      message: "Username must not be longer than 30 characters."
    }),
  email: z
    .string({
      required_error: "Please select an email to display."
    })
    .email(),
  bio: z.string().max(160).min(4),
  urls: z
    .array(
      z.object({
        value: z.string().url({ message: "Please enter a valid URL." })
      })
    )
    .optional()
});

type ProfileFormValues = z.infer<typeof profileFormSchema>;

export default function Page() {
  const [loading, setLoading] = useState(true);
  const [{ files }, { removeFile, openFileDialog, getInputProps }] = useFileUpload({
    accept: "image/*"
  });

  const [existingAvatar, setExistingAvatar] = useState<string | null>(null);
  const previewUrl = files[0]?.preview || existingAvatar || null;
  const fileName = files[0]?.file.name || null;

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      username: "",
      email: "",
      bio: "",
      urls: []
    },
    mode: "onChange"
  });

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const user = getCurrentUser();
        if (!user) return;

        const settings = await settingsApi.getUserSettings(user.id);
        
        // Set existing avatar if available
        if (settings.avatar) {
          // If avatar is already a full URL (starts with http), use it as is
          // If it starts with "files/", construct URL using /files prefix (static serving maps /files to files directory)
          // Otherwise, construct the URL from the relative path
          let avatarUrl: string;
          if (settings.avatar.startsWith('http')) {
            avatarUrl = settings.avatar;
          } else if (settings.avatar.startsWith('files/')) {
            // Path is "files/IMAGE/filename.jpg", access at "/files/IMAGE/filename.jpg"
            avatarUrl = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001'}/${settings.avatar}`;
          } else {
            // Path is "IMAGE/filename.jpg" or just "filename.jpg"
            avatarUrl = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001'}/files/${settings.avatar}`;
          }
          setExistingAvatar(avatarUrl);
        }
        
        form.reset({
          username: settings.username || "",
          email: settings.user?.email || "",
          bio: settings.bio || "",
          urls: settings.profileUrls?.map((url: string) => ({ value: url })) || []
        });
      } catch (error: any) {
        console.error('Failed to load settings:', error);
      } finally {
        setLoading(false);
      }
    };

    loadSettings();
  }, [form]);

  const { fields, append } = useFieldArray({
    name: "urls",
    control: form.control
  });

  async function onSubmit(data: ProfileFormValues) {
    try {
      const user = getCurrentUser();
      if (!user) {
        toast.error("Please log in to update settings");
        return;
      }

      let avatarPath: string | undefined = undefined;

      // If a new file was uploaded, upload it to the backend
      if (files.length > 0 && files[0]?.file instanceof File) {
        try {
          const uploadResult = await uploadApi.uploadSingle(files[0].file, user.id);
          // The backend returns relativePath as "files/IMAGE/filename.jpg"
          // We store it as-is since static serving at /files maps to the files directory
          avatarPath = uploadResult.relativePath || uploadResult.url || `files/${uploadResult.type}/${uploadResult.name}`;
        } catch (uploadError: any) {
          console.error('Failed to upload image:', uploadError);
          toast.error("Failed to upload image", { description: uploadError.message });
          return;
        }
      }

      await settingsApi.updateProfile(user.id, {
        username: data.username,
        email: data.email,
        bio: data.bio,
        urls: data.urls?.map(url => url.value) || [],
        avatar: avatarPath
      });

      toast.success("Profile updated successfully");
    } catch (error: any) {
      console.error('Failed to update profile:', error);
      toast.error("Failed to update profile", { description: error.message });
    }
  }

  return (
    <Card>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <div className="flex flex-col gap-2">
              <div className="inline-flex items-center gap-2 align-top">
                <Avatar className="h-20 w-20">
                  <AvatarImage src={`${previewUrl}`} />
                  <AvatarFallback>
                    <CircleUserRoundIcon className="opacity-45" />
                  </AvatarFallback>
                </Avatar>
                <div className="relative flex gap-2">
                  <Button type="button" onClick={openFileDialog} aria-haspopup="dialog">
                    {fileName ? "Change image" : "Upload image"}
                  </Button>
                  <input
                    {...getInputProps()}
                    className="sr-only"
                    aria-label="Upload image file"
                    tabIndex={-1}
                  />
                  {fileName && (
                    <Button
                      type="button"
                      size="icon"
                      variant="destructive"
                      onClick={() => removeFile(files[0]?.id)}>
                      <Trash2Icon />
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Username</FormLabel>
                  <FormControl>
                    <Input placeholder="shadcn" {...field} />
                  </FormControl>
                  <FormDescription>
                    This is your public display name. It can be your real name or a pseudonym. You
                    can only change this once every 30 days.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select a verified email to display" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="m@example.com">m@example.com</SelectItem>
                      <SelectItem value="m@google.com">m@google.com</SelectItem>
                      <SelectItem value="m@support.com">m@support.com</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    You can manage verified email addresses in your{" "}
                    <Link href="#">email settings</Link>.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="bio"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Bio</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Tell us a little bit about yourself"
                      className="resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    You can <span>@mention</span> other users and organizations to link to them.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="space-y-2">
              {fields.map((field, index) => (
                <FormField
                  control={form.control}
                  key={field.id}
                  name={`urls.${index}.value`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className={cn(index !== 0 && "sr-only")}>URLs</FormLabel>
                      <FormDescription className={cn(index !== 0 && "sr-only")}>
                        Add links to your website, blog, or social media profiles.
                      </FormDescription>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => append({ value: "" })}>
                Add URL
              </Button>
            </div>
            <Button type="submit">Update profile</Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
