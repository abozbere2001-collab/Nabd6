
"use client";

import React from 'react';
import { useTheme } from "@/components/theme-provider";
import type { ScreenProps } from '@/app/page';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Sun, Moon, Laptop, Gem, UserCog, Globe, Sparkles } from 'lucide-react';
import { useAuth, useAdmin } from '@/firebase';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

export function GeneralSettingsScreen({ navigate, goBack, canGoBack, headerActions }: ScreenProps) {
  const { theme, setTheme } = useTheme();
  const { isProUser } = useAuth();
  const { isAdmin, makeAdmin } = useAdmin();
  const { toast } = useToast();

  const handleMakeAdmin = async () => {
    await makeAdmin();
    toast({
        title: "تمت الترقية!",
        description: "لقد حصلت على صلاحيات المدير.",
    });
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <ScreenHeader title={"الإعدادات العامة"} onBack={goBack} canGoBack={true} actions={headerActions} />
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Sparkles className="h-6 w-6" />
              <div>
                <CardTitle>{"مظهر التطبيق"}</CardTitle>
                <CardDescription>{"اختر المظهر المفضل لديك."}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <RadioGroup value={theme} onValueChange={setTheme} className="grid grid-cols-3 gap-2 sm:gap-4">
               <Label htmlFor="dark" className="flex flex-col items-center justify-center rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer">
                <RadioGroupItem value="dark" id="dark" className="sr-only" />
                <Sparkles className="mb-2 h-5 w-5" />
                {"سماوي"}
              </Label>
              <Label htmlFor="light" className="flex flex-col items-center justify-center rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer">
                <RadioGroupItem value="light" id="light" className="sr-only" />
                <Sun className="mb-2 h-5 w-5" />
                {"فاتح"}
              </Label>
              <Label htmlFor="system" className="flex flex-col items-center justify-center rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer">
                <RadioGroupItem value="system" id="system" className="sr-only" />
                <Laptop className="mb-2 h-5 w-5" />
                {"النظام"}
              </Label>
            </RadioGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Globe className="h-6 w-6" />
              <div>
                <CardTitle>{"لغة التطبيق"}</CardTitle>
                <CardDescription>{"اختر لغة العرض."}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <RadioGroup defaultValue="ar" className="grid grid-cols-2 gap-2 sm:gap-4">
              <Label htmlFor="ar" className="flex items-center justify-center gap-2 rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer">
                <RadioGroupItem value="ar" id="ar" />
                {"العربية"}
              </Label>
              <Label htmlFor="en" className="flex items-center justify-center gap-2 rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer">
                <RadioGroupItem value="en" id="en" />
                {"English"}
              </Label>
            </RadioGroup>
            <p className="text-xs text-muted-foreground mt-4 text-center">ملاحظة: تغيير اللغة قيد التطوير حاليًا.</p>
          </CardContent>
        </Card>
        
        <Card>
           <CardHeader>
                <div className="flex items-center gap-3">
                    <UserCog className="h-6 w-6" />
                    <div>
                        <CardTitle>{"إعدادات الحساب"}</CardTitle>
                        <CardDescription>{"قم بترقية حسابك أو تعديل صلاحياتك."}</CardDescription>
                    </div>
                </div>
            </CardHeader>
          <CardContent className="space-y-4">
             {!isProUser && (
                <Button onClick={() => navigate('GoPro')} className="w-full bg-gradient-to-r from-yellow-400 to-orange-500 text-white hover:opacity-90">
                    <Gem className="ml-2 h-4 w-4" />
                    الترقية إلى النسخة الإحترافية
                </Button>
            )}
             {!isAdmin && (
                <Button onClick={handleMakeAdmin} variant="secondary" className="w-full">
                    الترقية إلى مدير
                </Button>
            )}
            {isAdmin && <p className="text-sm text-center text-muted-foreground">أنت مدير بالفعل.</p>}
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
