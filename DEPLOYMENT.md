# Choconaut Website Deployment Guide

## Overview
This repository contains the Choconaut website and is configured for automatic deployment to an EC2 Linux instance using GitHub Actions.

## EC2 Instance Details
- **IP Address**: 15.207.110.17
- **Key Pair**: keypair_choconaut.pem (stored locally, NOT in repository)

## Setup Instructions

### 1. Configure GitHub Secrets
Go to your GitHub repository → Settings → Secrets and variables → Actions, and add the following secrets:

- **EC2_HOST**: `15.207.110.17`
- **EC2_USERNAME**: `ec2-user` (or `ubuntu` depending on your AMI)
- **EC2_SSH_KEY**: The contents of your `keypair_choconaut.pem` file

To get the EC2_SSH_KEY value:
```bash
cat keypair_choconaut.pem
```
Copy the entire output including the BEGIN and END lines.

### 2. Prepare Your EC2 Instance

SSH into your EC2 instance:
```bash
ssh -i keypair_choconaut.pem ec2-user@15.207.110.17
```

#### Install Web Server (Apache)
```bash
sudo yum update -y
sudo yum install -y httpd git
sudo systemctl start httpd
sudo systemctl enable httpd
```

#### Or Install Nginx (Alternative)
```bash
sudo yum update -y
sudo yum install -y nginx git
sudo systemctl start nginx
sudo systemctl enable nginx
```

#### Configure Security Group
Make sure your EC2 security group allows:
- SSH (Port 22) from your IP
- HTTP (Port 80) from anywhere (0.0.0.0/0)
- HTTPS (Port 443) from anywhere (optional, for SSL)

### 3. Clone Repository on EC2

For Apache:
```bash
cd /var/www/html
sudo git clone https://github.com/choconaut-ash/Choconaut-website.git .
sudo chown -R apache:apache /var/www/html
sudo chmod -R 755 /var/www/html
```

For Nginx:
```bash
cd /usr/share/nginx/html
sudo git clone https://github.com/choconaut-ash/Choconaut-website.git .
sudo chown -R nginx:nginx /usr/share/nginx/html
sudo chmod -R 755 /usr/share/nginx/html
```

### 4. Configure Git on EC2

Set up Git to allow the directory:
```bash
cd /var/www/html  # or /usr/share/nginx/html
sudo git config --global --add safe.directory /var/www/html
```

Optional: Set up GitHub SSH access on EC2 for private repos:
```bash
ssh-keygen -t ed25519 -C "your_email@example.com"
cat ~/.ssh/id_ed25519.pub
# Add this key to your GitHub account → Settings → SSH Keys
```

### 5. Test Manual Deployment

```bash
cd /var/www/html
sudo git pull origin main
sudo systemctl restart httpd  # or nginx
```

Visit http://15.207.110.17 in your browser to verify the website is live.

## How It Works

### Automatic Deployment
Every time you push to the `main` branch:
1. GitHub Actions triggers the deployment workflow
2. The workflow connects to your EC2 instance via SSH
3. It pulls the latest code from the repository
4. Sets proper permissions
5. Automatically renews SSL certificate if needed (within 30 days of expiry)
6. Restarts the web server

### Manual Deployment
You can also trigger deployment manually:
1. Go to Actions tab in GitHub
2. Select "Deploy to EC2" workflow
3. Click "Run workflow"

## Project Structure
```
Choconaut-website/
├── Index.html          # Main website file
├── images/             # Image assets
├── .github/
│   └── workflows/
│       └── deploy.yml  # GitHub Actions deployment workflow
└── keypair_choconaut.pem  # EC2 SSH key (DO NOT COMMIT)
```

## Security Notes

⚠️ **IMPORTANT**: 
- Never commit `keypair_choconaut.pem` to the repository
- The keypair is listed in `.gitignore`
- SSH key is stored securely in GitHub Secrets
- Change EC2 SSH key permissions: `chmod 400 keypair_choconaut.pem`

## Troubleshooting

### Deployment fails with permission errors
```bash
# SSH into EC2 and fix permissions
sudo chown -R apache:apache /var/www/html
sudo chmod -R 755 /var/www/html
```

### Can't connect to EC2
- Check security group allows SSH from GitHub Actions IPs
- Verify EC2_SSH_KEY secret is correctly formatted
- Ensure EC2 instance is running

### Website not updating
- Check GitHub Actions logs for errors
- Manually SSH and run `git pull` to test
- Verify web server is running: `sudo systemctl status httpd`

## Local Development

To test locally:
```bash
# Simple HTTP server
python3 -m http.server 8000
# Then visit http://localhost:8000
```

## Support
For issues, please check the GitHub Actions logs in the Actions tab.
