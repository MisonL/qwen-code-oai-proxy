#!/usr/bin/env python3

import requests
import json
import os
import time
import sys
from urllib.parse import urlparse

# 默认 Qwen 配置 (来自 qwen-code)
DEFAULT_QWEN_API_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1'
DEFAULT_MODEL = 'qwen3-coder-plus'
DEFAULT_ANTHROPIC_MODEL = 'claude-3-5-sonnet-latest'
QWEN_OAUTH_CLIENT_ID = 'f0304373b74a44d2b584a3fb70ca9e56'

def load_credentials():
    """从文件加载 Qwen 凭据"""
    home_dir = os.path.expanduser("~")
    creds_path = os.path.join(home_dir, ".qwen", "oauth_creds.json")
    
    try:
        with open(creds_path, 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        print("未找到凭据。请先使用 qwen-code 进行认证。")
        return None
    except Exception as e:
        print(f"加载凭据时出错: {e}")
        return None

def get_api_endpoint(credentials):
    """获取 API 端点，如果可用则使用 resource_url"""
    # 检查凭据是否包含自定义端点
    if credentials and 'resource_url' in credentials and credentials['resource_url']:
        endpoint = credentials['resource_url']
        # 确保有协议
        if not urlparse(endpoint).scheme:
            endpoint = f"https://{endpoint}"
        # 确保有 /v1 后缀
        if not endpoint.endswith('/v1'):
            if endpoint.endswith('/'):
                endpoint += 'v1'
            else:
                endpoint += '/v1'
        return endpoint
    else:
        # 使用默认端点
        return DEFAULT_QWEN_API_BASE_URL

def test_v1_endpoints():
    """测试 OpenAI 兼容的 v1 端点"""
    print("测试 v1 端点...")
    
    # 加载凭据
    credentials = load_credentials()
    if not credentials:
        return False
    
    access_token = credentials.get('access_token')
    if not access_token:
        print("凭据中未找到访问令牌。")
        return False
    
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {access_token}",
        "User-Agent": "QwenCode/1.0.0 (linux; x64)"
    }
    
    # 测试 /v1/models 端点
    print("\n1. 测试 /v1/models 端点...")
    try:
        response = requests.get("http://localhost:8765/v1/models", headers=headers, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            print(f"   ✓ /v1/models: 找到 {len(data['data'])} 个模型")
            for model in data["data"]:
                print(f"     - {model['id']}")
        else:
            print(f"   ✗ /v1/models 失败，状态码: {response.status_code}")
            print(f"     响应: {response.text}")
            return False
    except Exception as e:
        print(f"   ✗ /v1/models 错误: {str(e)}")
        return False
    
    # 测试 /v1/chat/completions 端点
    print("\n2. 测试 /v1/chat/completions 端点...")
    try:
        payload = {
            "model": DEFAULT_MODEL,
            "messages": [
                {"role": "user", "content": "Hello, please tell me about yourself in 50 words."}
            ],
            "temperature": 0.3,
            "max_tokens": 150
        }
        
        response = requests.post(
            "http://localhost:8765/v1/chat/completions", 
            json=payload, 
            headers=headers, 
            timeout=30
        )
        
        if response.status_code == 200:
            data = response.json()
            print("   ✓ /v1/chat/completions: 成功")
            print(f"     响应: {data['choices'][0]['message']['content'][:100]}...")
        else:
            print(f"   ✗ /v1/chat/completions 失败，状态码: {response.status_code}")
            print(f"     响应: {response.text}")
            return False
    except Exception as e:
        print(f"   ✗ /v1/chat/completions 错误: {str(e)}")
        return False
    
    return True

def test_anthropic_endpoints():
    """测试 Claude Code 优化的 Anthropic 兼容端点"""
    print("\n测试 Claude Code 优化的 Anthropic 端点...")
    
    # 加载凭据
    credentials = load_credentials()
    if not credentials:
        return False
    
    access_token = credentials.get('access_token')
    if not access_token:
        print("凭据中未找到访问令牌。")
        return False
    
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {access_token}",
        "User-Agent": "QwenCode/1.0.0 (linux; x64)",
        "anthropic-version": "2023-06-01"  # 标准 Anthropic 头部
    }
    
    # 测试 /anthropic/v1/models 端点
    print("\n3. 测试 /anthropic/v1/models 端点...")
    try:
        response = requests.get("http://localhost:8765/anthropic/v1/models", headers=headers, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            print(f"   ✓ /anthropic/v1/models: 找到 {len(data['data'])} 个模型")
            for model in data["data"]:
                print(f"     - {model['id']}")
        else:
            print(f"   ✗ /anthropic/v1/models 失败，状态码: {response.status_code}")
            print(f"     响应: {response.text}")
            return False
    except Exception as e:
        print(f"   ✗ /anthropic/v1/models 错误: {str(e)}")
        return False
    
    # 测试 /anthropic/v1/messages 端点
    print("\n4. 测试 /anthropic/v1/messages 端点...")
    try:
        payload = {
            "model": DEFAULT_ANTHROPIC_MODEL,
            "max_tokens": 150,
            "temperature": 0.3,
            "messages": [
                {"role": "user", "content": "Hello, please tell me about yourself in 50 words."}
            ]
        }
        
        response = requests.post(
            "http://localhost:8765/anthropic/v1/messages", 
            json=payload, 
            headers=headers, 
            timeout=30
        )
        
        if response.status_code == 200:
            data = response.json()
            print("   ✓ /anthropic/v1/messages: 成功")
            if 'content' in data and len(data['content']) > 0:
                print(f"     响应: {data['content'][0]['text'][:100]}...")
            else:
                print("     响应: 未返回内容")
        else:
            print(f"   ✗ /anthropic/v1/messages 失败，状态码: {response.status_code}")
            print(f"     响应: {response.text}")
            return False
    except Exception as e:
        print(f"   ✗ /anthropic/v1/messages 错误: {str(e)}")
        return False
    
    return True

def test_health_endpoint():
    """测试健康端点"""
    print("\n5. 测试健康端点...")
    try:
        response = requests.get("http://localhost:8765/health", timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            print("   ✓ 健康端点: 正常")
            print(f"     状态: {data.get('status', '未知')}")
            return True
        else:
            print(f"   ✗ 健康端点失败，状态码: {response.status_code}")
            print(f"     响应: {response.text}")
            return False
    except Exception as e:
        print(f"   ✗ 健康端点错误: {str(e)}")
        return False

def main():
    """主函数"""
    print("Qwen OpenAI 兼容和 Claude Code 优化 Anthropic 代理测试")
    print("=" * 70)
    
    # 首先测试健康端点
    health_ok = test_health_endpoint()
    
    if not health_ok:
        print("\n❌ 健康检查失败 - 代理服务器可能未运行")
        return
    
    # 测试 v1 端点 (OpenAI 兼容)
    v1_ok = test_v1_endpoints()
    
    # 测试 Claude Code 优化的 Anthropic 端点
    anthropic_ok = test_anthropic_endpoints()
    
    # 总结
    print("\n" + "=" * 70)
    print("测试总结:")
    print(f"  健康检查: {'✅' if health_ok else '❌'}")
    print(f"  v1 端点: {'✅' if v1_ok else '❌'}")
    print(f"  Claude Code 端点: {'✅' if anthropic_ok else '❌'}")
    
    if v1_ok and anthropic_ok:
        print("\n🎉 所有测试通过！代理服务器在 OpenAI 和 Claude Code 优化的 Anthropic API 方面都正常工作。")
    elif v1_ok:
        print("\n⚠️  OpenAI 兼容 API 工作正常，但 Claude Code 优化的 API 存在问题。")
    elif anthropic_ok:
        print("\n⚠️  Claude Code 优化的 API 工作正常，但 OpenAI API 存在问题。")
    else:
        print("\n❌ 两个 API 都存在问题。请检查您的代理服务器配置。")

if __name__ == "__main__":
    main()