# -*- coding: utf-8 -*-
"""
QuickNote 速记通 - Quick LAN IP Viewer
"""
import socket
import sys

def get_local_ips():
    ips = []
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ip = info[4][0]
            if not ip.startswith('127.'):
                ips.append(ip)
    except Exception:
        pass
    if not ips:
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(('8.8.8.8', 80))
            ips.append(s.getsockname()[0])
            s.close()
        except Exception:
            pass
    return list(dict.fromkeys(ips))

if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8') if hasattr(sys.stdout, 'reconfigure') else None
    ips = get_local_ips()
    print()
    print('+--------------------------------------+')
    print('|   QuickNote 速记通 - LAN IP Viewer   |')
    print('+--------------------------------------+')
    if ips:
        for ip in ips:
            line = f'  http://{ip}:3001'
            print(f'| {line:<37s}|')
        print('+--------------------------------------+')
        print('|  Copy the IP above into App Settings |')
    else:
        print('|  No LAN IP detected                  |')
    print('+--------------------------------------+')
    print()
