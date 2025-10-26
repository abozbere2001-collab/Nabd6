
"use client";

import React, { useState, useEffect } from 'react';
import type { ScreenProps } from '@/app/page';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth, useFirestore } from '@/firebase/provider';
import { updateUserDisplayName } from '@/lib/firebase-client';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Copy } from 'lucide-react';
import { doc, onSnapshot } from 'firebase/firestore';
import type { UserProfile } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';

export function ProfileScreen({ navigate, goBack, canGoBack, headerActions }: ScreenProps) {
  const { user } = useAuth();
  const { db } = useFirestore();
  const { toast } = useToast();
  
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user || !db) {
        setLoading(false);
        return;
    };
    
    setLoading(true);
    const unsub = onSnapshot(doc(db, 'users', user.uid), (doc) => {
        if (doc.exists()) {
            const data = doc.data() as UserProfile;
            setProfile(data);
            setDisplayName(data.displayName || '');
        }
        setLoading(false);
    });

    return () => unsub();

  }, [user, db]);

  const handleSave = async () => {
    if (!user || !displayName.trim() || displayName.trim().length < 3) {
      toast({
        variant: 'destructive',
        title: 'خطأ',
        description: 'يجب أن يتكون اسم العرض من 3 أحرف على الأقل.',
      });
      return;
    }
    if (!db) {
      toast({
        variant: 'destructive',
        title: 'خطأ',
        description: 'خدمة قاعدة البيانات غير متاحة حاليًا.',
      });
      return;
    }
    
    setSaving(true);
    try {
      await updateUserDisplayName(user, displayName.trim(), db);
      toast({
        title: 'تم الحفظ بنجاح',
        description: 'تم تحديث اسم العرض الخاص بك.',
      });
    } catch (error) {
      console.error("Error updating display name:", error);
      toast({
        variant: 'destructive',
        title: 'فشل التحديث',
        description: 'حدث خطأ أثناء تحديث اسمك. يرجى المحاولة مرة أخرى.',
      });
    } finally {
      setSaving(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
        title: 'تم النسخ',
        description: 'تم نسخ معرّف المستخدم بنجاح.',
    });
  }
  
  const isAnonymousUser = user?.isAnonymous;

  return (
    <div className="flex h-full flex-col bg-background">
      <ScreenHeader title="الملف الشخصي" onBack={goBack} canGoBack={true} actions={headerActions} />
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loading ? (
          <Card>
            <CardHeader className="items-center text-center">
                 <Skeleton className="h-24 w-24 rounded-full" />
                 <div className="w-full space-y-2 pt-2">
                    <Skeleton className="h-6 w-40 mx-auto" />
                    <Skeleton className="h-4 w-60 mx-auto" />
                 </div>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-2">
                    <Skeleton className="h-5 w-24" />
                    <Skeleton className="h-10 w-full" />
                </div>
                 <Skeleton className="h-10 w-full" />
            </CardContent>
          </Card>
        ) : profile ? (
          <>
            <Card>
              <CardHeader className="items-center text-center">
                <Avatar className="h-24 w-24 border-2 border-primary mb-4">
                  <AvatarImage src={profile.photoURL} alt={profile.displayName} />
                  <AvatarFallback>{profile.displayName?.charAt(0)}</AvatarFallback>
                </Avatar>
                <CardTitle>{profile.displayName}</CardTitle>
                <CardDescription>{isAnonymousUser ? 'حساب زائر' : profile.email}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="displayName">اسم العرض</Label>
                  <Input
                    id="displayName"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="اختر اسمًا يظهر للمستخدمين الآخرين"
                    disabled={isAnonymousUser}
                  />
                   {isAnonymousUser && <p className="text-xs text-muted-foreground">لا يمكن للزوار تغيير اسم العرض. قم بإنشاء حساب دائم.</p>}
                </div>
                <Button onClick={handleSave} disabled={saving || loading || displayName === profile.displayName || isAnonymousUser} className="w-full">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'حفظ التغييرات'}
                </Button>
              </CardContent>
            </Card>

            {user && (
                 <Card>
                    <CardHeader>
                        <CardTitle>معلومات فنية</CardTitle>
                        <CardDescription>
                            يمكنك استخدام هذا المعرف للبحث عن بياناتك في قاعدة البيانات.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Label>معرّف المستخدم (User ID)</Label>
                        <div className="flex items-center gap-2">
                            <Input 
                                readOnly 
                                value={user.uid} 
                                className="text-xs text-muted-foreground"
                                dir="ltr"
                            />
                            <Button variant="outline" size="icon" onClick={() => copyToClipboard(user.uid)}>
                                <Copy className="h-4 w-4" />
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}
          </>
        ) : (
            <p className="text-center text-muted-foreground pt-8">لم يتم العثور على ملفك الشخصي.</p>
        )}
      </div>
    </div>
  );
}
