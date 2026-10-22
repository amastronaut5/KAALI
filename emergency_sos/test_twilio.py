"""
=============================================================================
TWILIO REAL VOICE CALL & SMS TEST UTILITY — KAALI EMERGENCY SOS
=============================================================================
Use this script to verify that your Twilio account is able to make actual
phone calls and send real SMS to your phone number.

Usage:
  python test_twilio.py --to +919876543210 --call
  python test_twilio.py --to +919876543210 --sms
  python test_twilio.py --to +919876543210 --all
"""

import os
import sys
import argparse
import asyncio
from dotenv import load_dotenv

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

# Load environment from current folder
env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
load_dotenv(dotenv_path=env_path)

from app.config import settings
from app.sms import TwilioSMSDispatcher
from app.voice import TwilioVoiceDispatcher


async def main():
    parser = argparse.ArgumentParser(description="Test real Twilio voice calls and SMS for Emergency SOS")
    parser.add_argument("--to", nargs="+", required=True, help="Destination phone number(s) in E.164 format (e.g. +919876543210 +18777804236)")
    parser.add_argument("--call", action="store_true", help="Place an automated voice emergency phone call")
    parser.add_argument("--sms", action="store_true", help="Send an emergency SMS alert")
    parser.add_argument("--all", action="store_true", help="Both place call and send SMS")
    parser.add_argument("--name", default="JOHN WICK", help="Victim name to alert (default: JOHN WICK)")
    args = parser.parse_args()

    # Parse and normalize recipient phone numbers (supports space-separated or comma-separated)
    recipients = []
    for item in args.to:
        for num in item.split(","):
            cleaned = num.strip()
            if cleaned and cleaned not in recipients:
                recipients.append(cleaned)

    print("=" * 70)
    print("🛡️  KAALI EMERGENCY SOS — MULTI-CONTACT TWILIO DISPATCHER")
    print("=" * 70)

    sid = settings.TWILIO_ACCOUNT_SID
    token = settings.TWILIO_AUTH_TOKEN
    from_phone = settings.TWILIO_PHONE_NUMBER

    print(f"📋 Loaded Configuration from .env:")
    print(f"   Account SID: {sid[:6]}...{sid[-4:] if sid and len(sid) > 10 else '(NOT SET)'}")
    print(f"   Auth Token : {'*' * 8 if token else '(NOT SET)'}")
    print(f"   From Number: {from_phone or '(NOT SET)'}")
    print(f"   Victim Name: {args.name.upper()}")
    print(f"   Recipients ({len(recipients)} total): {', '.join(recipients)}")
    print("-" * 70)

    if not sid or not token or not from_phone:
        print("\n❌ TWILIO CREDENTIALS NOT FOUND OR INCOMPLETE!")
        print("To make real phone calls and send SMS:")
        print("1. Open: c:\\Users\\HP\\Desktop\\HACKERWRATH 3.O\\emergency sos\\.env")
        print("2. Set the following fields:")
        print("   TWILIO_ACCOUNT_SID=ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX")
        print("   TWILIO_AUTH_TOKEN=your_auth_token_here")
        print("   TWILIO_PHONE_NUMBER=+1XXXXXXXXXX")
        print("\nGet your free credentials in 60 seconds from https://console.twilio.com")
        print("=" * 70)
        return

    do_sms = args.sms or args.all or (not args.call and not args.sms and not args.all)
    do_call = args.call or args.all

    sms_client = TwilioSMSDispatcher()
    voice_client = TwilioVoiceDispatcher()

    # SOS Alert Message Body
    sms_msg = (
        f"SECURITY ALERT!\n"
        f"{args.name.upper()} IS IN DANGER !!!!\n"
        f"Radar: http://127.0.0.1:8001/live/demo | Call 112"
    )

    speech = (
        f"Security alert! {args.name} is in danger! "
        f"This is an urgent automated alert from Project KAALI. "
        f"{args.name} has triggered an emergency distress call. "
        f"Please check your phone immediately or dial 112."
    )

    # 1. DISPATCH SMS TO ALL RECIPIENTS
    if do_sms:
        print(f"\n📨 Broadcasting Emergency SOS SMS to {len(recipients)} contact(s)...")
        print(f"   Message Content:\n   {sms_msg.replace(chr(10), ' | ')}\n")
        for idx, phone in enumerate(recipients, 1):
            print(f"   [{idx}/{len(recipients)}] Sending SMS to {phone}...")
            res_sms = await sms_client.send_sms(phone, sms_msg)
            status = res_sms.get("status")
            sid_val = res_sms.get("sid", "N/A")
            if status in ("sent", "queued"):
                print(f"       ✅ Status: {status} | SID: {sid_val}")
            else:
                print(f"       ⚠️ Status: {status}")

    # 2. DISPATCH VOICE CALL TO ALL RECIPIENTS
    if do_call:
        print(f"\n📞 Placing Automated Voice Calls to {len(recipients)} contact(s)...")
        for idx, phone in enumerate(recipients, 1):
            print(f"   [{idx}/{len(recipients)}] Calling {phone}...")
            res_call = await voice_client.make_call(phone, speech)
            status = res_call.get("status")
            sid_val = res_call.get("sid", "N/A")
            if status in ("queued", "in-progress", "initiated"):
                print(f"       🔔 Call Initiated! Status: {status} | SID: {sid_val}")
            else:
                print(f"       ⚠️ Status: {status}")

    print("\n" + "=" * 70)
    print("✅ MULTI-CONTACT BROADCAST COMPLETE!")
    print("=" * 70)


if __name__ == "__main__":
    asyncio.run(main())
