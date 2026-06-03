import sys
import pyautogui
import time

def main():
    if len(sys.argv) < 5:
        print("Usage: python3 insta360-click-agent.py <x> <y> <w> <h>")
        sys.exit(1)
        
    x = int(sys.argv[1])
    y = int(sys.argv[2])
    w = int(sys.argv[3])
    h = int(sys.argv[4])
    
    # Calculate center of the button
    center_x = x + (w // 2)
    center_y = y + (h // 2)
    
    # Move mouse smoothly to look human
    pyautogui.moveTo(center_x, center_y, duration=0.5)
    
    # Click!
    pyautogui.click()
    
    print(f"✅ Clicked at ({center_x}, {center_y})")

if __name__ == "__main__":
    main()
