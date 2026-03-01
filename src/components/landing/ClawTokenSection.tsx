import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, Coins, Shield, Zap, TrendingUp, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { CONTRACTS } from '@/lib/contracts';

export function ClawTokenSection() {
    const navigate = useNavigate();
    const contractAddress = CONTRACTS.CLAW_TOKEN.address;
    const shortAddress = `${contractAddress.slice(0, 6)}...${contractAddress.slice(-4)}`;

    return (
        <section className="py-20 md:py-28 relative overflow-hidden">
            {/* Background glow effects */}
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/5 rounded-full blur-[120px]" />
                <div className="absolute top-1/3 right-1/4 w-[300px] h-[300px] bg-accent/5 rounded-full blur-[80px]" />
            </div>

            <div className="container mx-auto px-4 relative z-10">
                <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
                    {/* Left: 3D Token Logo */}
                    <div className="flex justify-center lg:justify-end order-2 lg:order-1">
                        <div className="relative">
                            {/* Outer glow ring */}
                            <div className="absolute inset-0 rounded-full bg-gradient-to-r from-primary/20 via-accent/20 to-primary/20 blur-[40px] animate-pulse" />

                            {/* Token image */}
                            <div className="relative w-64 h-64 md:w-80 md:h-80 lg:w-96 lg:h-96">
                                <img
                                    src="/claw.png"
                                    alt="CLAW Token"
                                    className="w-full h-full object-contain drop-shadow-2xl animate-float"
                                />
                            </div>

                            {/* Floating data badges */}
                            <div className="absolute -top-2 -right-2 md:top-2 md:right-0">
                                <Badge className="bg-primary/10 text-primary border-primary/20 backdrop-blur-sm px-3 py-1.5 text-xs font-mono shadow-lg">
                                    ERC-20
                                </Badge>
                            </div>
                            <div className="absolute -bottom-2 -left-2 md:bottom-4 md:left-0">
                                <Badge className="bg-accent/10 text-accent border-accent/20 backdrop-blur-sm px-3 py-1.5 text-xs font-mono shadow-lg">
                                    Polygon Amoy
                                </Badge>
                            </div>
                        </div>
                    </div>

                    {/* Right: Token Info */}
                    <div className="space-y-8 order-1 lg:order-2">
                        <div className="space-y-4">
                            <Badge variant="outline" className="text-primary border-primary/30 px-3 py-1 text-xs uppercase tracking-wider">
                                Platform Token
                            </Badge>
                            <h2 className="text-3xl md:text-4xl lg:text-5xl font-display font-bold tracking-tight">
                                Meet <span className="text-primary">CLAW</span>
                            </h2>
                            <p className="text-lg text-muted-foreground leading-relaxed max-w-lg">
                                The native token powering the ClawTrader ecosystem. Upgrade your AI agents,
                                swap for USDC, and fuel your trading strategies — all with CLAW.
                            </p>
                        </div>

                        {/* Token utility cards */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <Card className="border-border/50 bg-muted/20 backdrop-blur-sm">
                                <CardContent className="p-4 flex items-start gap-3">
                                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                                        <Zap className="w-4 h-4 text-primary" />
                                    </div>
                                    <div>
                                        <p className="font-medium text-sm">Update Agent</p>
                                        <p className="text-xs text-muted-foreground mt-0.5">Upgrade and modify your AI trading bots</p>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="border-border/50 bg-muted/20 backdrop-blur-sm">
                                <CardContent className="p-4 flex items-start gap-3">
                                    <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
                                        <RefreshCw className="w-4 h-4 text-accent" />
                                    </div>
                                    <div>
                                        <p className="font-medium text-sm">Swap USDC → CLAW</p>
                                        <p className="text-xs text-muted-foreground mt-0.5">Exchange USDC for CLAW tokens instantly</p>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>

                        {/* Contract address + CTA */}
                        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                            <Button
                                onClick={() => navigate('/trading')}
                                className="rounded-full px-6 gap-2"
                            >
                                Start Using CLAW
                                <ArrowRight className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            {/* CSS for float animation */}
            <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px) rotate(-2deg); }
          50% { transform: translateY(-12px) rotate(2deg); }
        }
        .animate-float {
          animation: float 4s ease-in-out infinite;
        }
      `}</style>
        </section>
    );
}
