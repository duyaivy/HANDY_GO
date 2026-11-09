import type { ReactNode } from 'react';
import type { ChatAttachment } from './types';
import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';
import { PlayIcon, RetryIcon } from '@/components/ui/icons/handy-icons';

export function ChatMediaCard({ attachment, onOpen, onRefresh, footer }: {
  attachment: Pick<ChatAttachment, 'id' | 'mediaType' | 'url' | 'width' | 'height'>;
  onOpen: () => void;
  onRefresh?: () => Promise<string>;
  footer?: ReactNode;
}) {
  const { width } = useWindowDimensions();
  const [url, setUrl] = useState(attachment.url);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const attempted = useRef(false);
  const refreshing = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    setUrl(attachment.url);
    setFailed(false);
    setLoading(true);
    attempted.current = false;
  }, [attachment.url]);
  const refresh = async () => {
    if (!onRefresh || refreshing.current)
      return;
    refreshing.current = true;
    setLoading(true);
    setFailed(false);
    try {
      const nextUrl = await onRefresh();
      if (!nextUrl || nextUrl === url)
        throw new Error('Image URL was not renewed');
      if (mounted.current)
        setUrl(nextUrl);
    }
    catch {
      if (mounted.current) {
        setFailed(true);
        setLoading(false);
      }
    }
    finally {
      refreshing.current = false;
    }
  };
  const ratio = attachment.width && attachment.height ? attachment.width / attachment.height : 4 / 3;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={attachment.mediaType === 'VIDEO' ? 'Xem video' : 'Xem ảnh'}
      onPress={onOpen}
      style={{ width: Math.min(280, width * 0.72), borderRadius: 18, overflow: 'hidden', backgroundColor: '#E2E8F0', marginBottom: 4 }}
    >
      {attachment.mediaType === 'IMAGE'
        ? (
            <Image
              testID={`chat-media-image-${attachment.id}`}
              source={url}
              style={{ width: '100%', aspectRatio: Math.max(0.6, Math.min(1.8, ratio)) }}
              contentFit="contain"
              cachePolicy="none"
              onLoad={() => {
                setLoading(false);
                setFailed(false);
              }}
              onError={() => {
                setLoading(false);
                if (!attempted.current && onRefresh) {
                  attempted.current = true;
                  void refresh();
                }
                else {
                  setFailed(true);
                }
              }}
            />
          )
        : (
            <View style={{ aspectRatio: 16 / 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1E293B', gap: 8 }}>
              <View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center' }}><PlayIcon size={32} /></View>
              <Text style={{ color: 'white', fontWeight: '600' }}>Video</Text>
            </View>
          )}
      {attachment.mediaType === 'IMAGE' && loading && !failed && (
        <View pointerEvents="none" style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#64748B', fontSize: 12 }}>Đang tải ảnh…</Text></View>
      )}
      {failed && (
        <View style={{ position: 'absolute', inset: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: '#E2E8F0', gap: 8 }}>
          <Text style={{ color: '#475569', fontSize: 12 }}>Chưa tải được ảnh</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={onRefresh ? 'Tải lại ảnh' : 'Xem ảnh'}
            onPress={() => {
              if (onRefresh) {
                void refresh();
              }
              else {
                onOpen();
              }
            }}
            style={{ minWidth: 48, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
          >
            <RetryIcon />
          </Pressable>
        </View>
      )}
      {footer}
    </Pressable>
  );
}
